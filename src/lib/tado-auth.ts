import { OAuthError, type TokenSet } from "./oauth";

// Tados enhetskodsflöde (äldre generationen, my.tado.com). Publik klient: inget hemligt skickas.
// Klient-id och adresser enligt Tados hjälpartikel om REST-API:t och community-bibliotek; ej verifierat från byggmiljön.
export const TADO_DEFAULT_CLIENT_ID = "1bb50063-6b0c-4d11-bd99-387f4a91cc46";
const AUTHORIZE = "https://login.tado.com/oauth2/device_authorize";
const TOKEN = "https://login.tado.com/oauth2/token";

export interface DeviceAuth {
  deviceCode: string;
  userCode: string;
  /** Sida hos Tado där användaren godkänner. */
  verifyUrl: string;
  expiresAt: number;
  intervalS: number;
}

export type PollResult =
  | { status: "ok"; tokens: TokenSet }
  | { status: "pending" }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "failed" };

async function postForm(url: string, params: Record<string, string>, fetchFn: typeof fetch): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString(), cache: "no-store" });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // Inte JSON.
  }
  return { res, json };
}

function isTadoUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && (url.hostname === "tado.com" || url.hostname.endsWith(".tado.com"));
  } catch {
    return false;
  }
}

function tokensFrom(json: Record<string, unknown>, nowMs: number, fallbackRefresh?: string): TokenSet | null {
  const access = json.access_token;
  const refresh = typeof json.refresh_token === "string" ? json.refresh_token : fallbackRefresh;
  const expiresIn = json.expires_in;
  if (typeof access !== "string" || !refresh || typeof expiresIn !== "number") return null;
  return { accessToken: access, refreshToken: refresh, expiresAt: nowMs + expiresIn * 1000 };
}

export async function startDeviceAuth(clientId: string, fetchFn: typeof fetch = fetch, nowMs: number = Date.now()): Promise<DeviceAuth> {
  const { res, json } = await postForm(AUTHORIZE, { client_id: clientId, scope: "offline_access" }, fetchFn);
  if (!res.ok) throw new Error(`Tado svarade ${res.status}`);
  const verifyUrl = isTadoUrl(json.verification_uri_complete) ? json.verification_uri_complete : json.verification_uri;
  if (typeof json.device_code !== "string" || typeof json.user_code !== "string" || typeof json.expires_in !== "number" || !isTadoUrl(verifyUrl)) {
    throw new Error("Ogiltigt svar från Tado");
  }
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verifyUrl,
    expiresAt: nowMs + json.expires_in * 1000,
    intervalS: typeof json.interval === "number" && json.interval > 0 ? json.interval : 5,
  };
}

export async function pollDeviceToken(clientId: string, deviceCode: string, fetchFn: typeof fetch = fetch, nowMs: number = Date.now()): Promise<PollResult> {
  let res: Response, json: Record<string, unknown>;
  try {
    ({ res, json } = await postForm(TOKEN, { client_id: clientId, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }, fetchFn));
  } catch {
    return { status: "failed" };
  }
  if (res.ok) {
    const tokens = tokensFrom(json, nowMs);
    return tokens ? { status: "ok", tokens } : { status: "failed" };
  }
  if (json.error === "authorization_pending" || json.error === "slow_down") return { status: "pending" };
  if (json.error === "expired_token") return { status: "expired" };
  if (json.error === "access_denied") return { status: "denied" };
  return { status: "failed" };
}

/** Refresh-token roteras: den nya ersätter den gamla. */
export async function refreshTadoTokens(clientId: string, refreshToken: string, fetchFn: typeof fetch = fetch, nowMs: number = Date.now()): Promise<TokenSet> {
  const { res, json } = await postForm(TOKEN, { client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn);
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : undefined;
    throw new OAuthError(`Tado-förnyelse misslyckades (${res.status}${code ? `, ${code}` : ""})`, res.status, code);
  }
  const tokens = tokensFrom(json, nowMs, refreshToken);
  if (!tokens) throw new OAuthError("Ogiltigt tokensvar från Tado", res.status);
  return tokens;
}
