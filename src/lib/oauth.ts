import { randomBytes, timingSafeEqual } from "node:crypto";

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Millisekunder sedan epoch. */
  expiresAt: number;
}

/** Fel från tokenändpunkten. Meddelandet innehåller aldrig hemligheter eller hela svarskroppen. */
export class OAuthError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "OAuthError";
  }
}

export function newState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(cfg: OAuthConfig, state: string): string {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Jämför state i konstant tid. Tom eller saknad state matchar aldrig. */
export function statesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function tokenRequest(cfg: OAuthConfig, params: Record<string, string>, fallbackRefresh: string | undefined, fetchFn: typeof fetch, nowMs: number): Promise<TokenSet> {
  const res = await fetchFn(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // Svaret var inte JSON (t.ex. HTML från en proxy).
  }
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : undefined;
    throw new OAuthError(`Tokenförfrågan misslyckades (${res.status}${code ? `, ${code}` : ""})`, res.status, code);
  }
  const access = json.access_token;
  const refresh = typeof json.refresh_token === "string" ? json.refresh_token : fallbackRefresh;
  const expiresIn = json.expires_in;
  if (typeof access !== "string" || !refresh || typeof expiresIn !== "number") throw new OAuthError("Ogiltigt tokensvar", res.status);
  return { accessToken: access, refreshToken: refresh, expiresAt: nowMs + expiresIn * 1000 };
}

export function exchangeCode(cfg: OAuthConfig, code: string, fetchFn: typeof fetch = fetch, nowMs: number = Date.now()): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }, undefined, fetchFn, nowMs);
}

/** Behåller den gamla refresh-token om tjänsten inte skickar en ny. */
export function refreshTokens(cfg: OAuthConfig, refreshToken: string, fetchFn: typeof fetch = fetch, nowMs: number = Date.now()): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, refreshToken, fetchFn, nowMs);
}
