import { describe, expect, it } from "vitest";
import { TADO_DEFAULT_CLIENT_ID, pollDeviceToken, refreshTadoTokens, startDeviceAuth } from "./tado-auth";

const NOW = 1_000_000;
function rec(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { fn, calls, form: () => new URLSearchParams(String(calls[0]!.init.body)) };
}

describe("startDeviceAuth", () => {
  it("asks for a device code with the public client and offline access", async () => {
    const f = rec(200, { device_code: "DEV", user_code: "7BQ5ZQ", verification_uri: "https://login.tado.com/oauth2/device", verification_uri_complete: "https://login.tado.com/oauth2/device?user_code=7BQ5ZQ", expires_in: 300, interval: 5 });
    const r = await startDeviceAuth(TADO_DEFAULT_CLIENT_ID, f.fn, NOW);
    expect(f.calls[0]!.url).toBe("https://login.tado.com/oauth2/device_authorize");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(f.form().get("client_id")).toBe(TADO_DEFAULT_CLIENT_ID);
    expect(f.form().get("scope")).toBe("offline_access");
    expect(r).toEqual({ deviceCode: "DEV", userCode: "7BQ5ZQ", verifyUrl: "https://login.tado.com/oauth2/device?user_code=7BQ5ZQ", expiresAt: NOW + 300_000, intervalS: 5 });
  });
  it("falls back to verification_uri and a 5 s interval when missing", async () => {
    const f = rec(200, { device_code: "DEV", user_code: "X", verification_uri: "https://login.tado.com/oauth2/device", expires_in: 300 });
    expect(await startDeviceAuth("c", f.fn, NOW)).toMatchObject({ verifyUrl: "https://login.tado.com/oauth2/device", intervalS: 5 });
  });
  it("rejects verification links outside tado.com", async () => {
    const f = rec(200, { device_code: "DEV", user_code: "X", verification_uri_complete: "https://ond.example.com/?c=X", expires_in: 300, interval: 5 });
    await expect(startDeviceAuth("c", f.fn, NOW)).rejects.toThrow();
  });
  it("error or broken response throws", async () => {
    await expect(startDeviceAuth("c", rec(500, {}).fn, NOW)).rejects.toThrow(/Tado/);
    await expect(startDeviceAuth("c", rec(200, { user_code: "X" }).fn, NOW)).rejects.toThrow();
  });
});

describe("pollDeviceToken", () => {
  it("success returns tokens and sends the device-code grant", async () => {
    const f = rec(200, { access_token: "A", refresh_token: "R", expires_in: 600 });
    expect(await pollDeviceToken("c", "DEV", f.fn, NOW)).toEqual({ status: "ok", tokens: { accessToken: "A", refreshToken: "R", expiresAt: NOW + 600_000 } });
    expect(f.calls[0]!.url).toBe("https://login.tado.com/oauth2/token");
    expect(f.form().get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(f.form().get("device_code")).toBe("DEV");
    expect(f.form().get("client_id")).toBe("c");
  });
  it.each([["authorization_pending", "pending"], ["slow_down", "pending"], ["expired_token", "expired"], ["access_denied", "denied"]])("%s gives %s", async (error, status) => {
    expect((await pollDeviceToken("c", "DEV", rec(400, { error }).fn, NOW)).status).toBe(status);
  });
  it("other failures give failed", async () => {
    expect((await pollDeviceToken("c", "DEV", rec(500, "<html>").fn, NOW)).status).toBe("failed");
    expect((await pollDeviceToken("c", "DEV", rec(200, { access_token: "A" }).fn, NOW)).status).toBe("failed");
  });
});

describe("refreshTadoTokens", () => {
  it("uses the refresh grant with client id and takes the rotated refresh token", async () => {
    const f = rec(200, { access_token: "A2", refresh_token: "R2", expires_in: 600 });
    expect(await refreshTadoTokens("c", "R1", f.fn, NOW)).toEqual({ accessToken: "A2", refreshToken: "R2", expiresAt: NOW + 600_000 });
    expect(f.form().get("grant_type")).toBe("refresh_token");
    expect(f.form().get("refresh_token")).toBe("R1");
    expect(f.form().get("client_id")).toBe("c");
  });
  it("invalid_grant throws an OAuthError with that code (so the connection is marked for reconnect)", async () => {
    const err = await refreshTadoTokens("c", "R1", rec(400, { error: "invalid_grant" }).fn, NOW).catch((e) => e);
    expect(err.code).toBe("invalid_grant");
    expect(err.message).not.toContain("R1");
  });
});
