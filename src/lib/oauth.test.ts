import { describe, expect, it } from "vitest";
import { OAuthError, buildAuthorizeUrl, exchangeCode, newState, refreshTokens, statesMatch, type OAuthConfig } from "./oauth";

const cfg: OAuthConfig = {
  authorizeUrl: "https://auth.example.com/authorize",
  tokenUrl: "https://auth.example.com/token",
  clientId: "klient-id",
  clientSecret: "hemligt-klient-svar",
  scope: "a b",
  redirectUri: "http://127.0.0.1:3000/api/connect/x/callback",
};
const NOW = 1_000_000;

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("buildAuthorizeUrl", () => {
  it("contains client_id, scope, redirect_uri, state, response_type=code", () => {
    const u = new URL(buildAuthorizeUrl(cfg, "S1"));
    expect(u.origin + u.pathname).toBe(cfg.authorizeUrl);
    expect(u.searchParams.get("client_id")).toBe("klient-id");
    expect(u.searchParams.get("scope")).toBe("a b");
    expect(u.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(u.searchParams.get("state")).toBe("S1");
    expect(u.searchParams.get("response_type")).toBe("code");
  });
  it("never includes the client secret", () => {
    expect(buildAuthorizeUrl(cfg, "S1")).not.toContain("hemligt");
  });
});

describe("exchangeCode", () => {
  it("posts form body with Basic auth", async () => {
    const f = fakeFetch(200, { access_token: "A", refresh_token: "R", expires_in: 3600 });
    await exchangeCode(cfg, "KOD", f.fn, NOW);
    const c = f.calls[0]!;
    expect(c.url).toBe(cfg.tokenUrl);
    expect(c.init.method).toBe("POST");
    const h = c.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Basic " + Buffer.from("klient-id:hemligt-klient-svar").toString("base64"));
    const body = new URLSearchParams(String(c.init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("KOD");
    expect(body.get("redirect_uri")).toBe(cfg.redirectUri);
  });
  it("computes expiresAt from expires_in", async () => {
    const f = fakeFetch(200, { access_token: "A", refresh_token: "R", expires_in: 3600 });
    expect(await exchangeCode(cfg, "K", f.fn, NOW)).toEqual({ accessToken: "A", refreshToken: "R", expiresAt: NOW + 3_600_000 });
  });
  it("rejects a response without refresh_token", async () => {
    const f = fakeFetch(200, { access_token: "A", expires_in: 3600 });
    await expect(exchangeCode(cfg, "K", f.fn, NOW)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("refreshTokens", () => {
  it("keeps old refresh token when response has none", async () => {
    const f = fakeFetch(200, { access_token: "A2", expires_in: 60 });
    expect(await refreshTokens(cfg, "GAMMAL", f.fn, NOW)).toEqual({ accessToken: "A2", refreshToken: "GAMMAL", expiresAt: NOW + 60_000 });
  });
  it("uses new refresh token when present", async () => {
    const f = fakeFetch(200, { access_token: "A2", refresh_token: "NY", expires_in: 60 });
    expect((await refreshTokens(cfg, "GAMMAL", f.fn, NOW)).refreshToken).toBe("NY");
    expect(new URLSearchParams(String(f.calls[0]!.init.body)).get("grant_type")).toBe("refresh_token");
  });
});

describe("errors", () => {
  it("error response throws OAuthError with code and without secret in message", async () => {
    const f = fakeFetch(400, { error: "invalid_grant", error_description: "Refresh token revoked", echo: "hemligt-klient-svar" });
    const err = await refreshTokens(cfg, "R", f.fn, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_grant");
    expect(err.message).not.toContain("hemligt");
  });
  it("non-JSON error body still throws OAuthError", async () => {
    const fn = (async () => new Response("<html>nere</html>", { status: 502 })) as unknown as typeof fetch;
    const err = await refreshTokens(cfg, "R", fn, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect(err.status).toBe(502);
  });
});

describe("state", () => {
  it("newState is long and unique", () => {
    expect(newState().length).toBeGreaterThanOrEqual(32);
    expect(newState()).not.toBe(newState());
  });
  it("statesMatch rejects undefined, empty and different strings", () => {
    expect(statesMatch(undefined, "a")).toBe(false);
    expect(statesMatch("a", undefined)).toBe(false);
    expect(statesMatch("", "")).toBe(false);
    expect(statesMatch("a", "b")).toBe(false);
    expect(statesMatch("abc", "abcd")).toBe(false);
    expect(statesMatch("abc", "abc")).toBe(true);
  });
});
