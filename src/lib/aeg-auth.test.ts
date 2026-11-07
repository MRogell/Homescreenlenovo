import { describe, expect, it } from "vitest";
import { refreshAegTokens } from "./aeg-auth";

const exp = (s: number) => `h.${Buffer.from(JSON.stringify({ exp: s })).toString("base64url")}.s`;
function rec(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("refreshAegTokens", () => {
  it("posts the refresh token as JSON and takes the rotated pair with expiry from the JWT", async () => {
    const f = rec(200, { accessToken: exp(5000), refreshToken: "R2" });
    expect(await refreshAegTokens("R1", f.fn, 1_000)).toEqual({ accessToken: exp(5000), refreshToken: "R2", expiresAt: 5_000_000 });
    expect(f.calls[0]!.url).toBe("https://api.developer.electrolux.one/api/v1/token/refresh");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ refreshToken: "R1" });
  });
  it("without a readable expiry assumes 10 minutes", async () => {
    expect((await refreshAegTokens("R1", rec(200, { accessToken: "opak", refreshToken: "R2" }).fn, 1_000)).expiresAt).toBe(601_000);
  });
  it("400/401 count as revoked (invalid_grant), others as temporary", async () => {
    for (const s of [400, 401]) expect((await refreshAegTokens("R1", rec(s, {}).fn, 0).catch((e) => e)).code).toBe("invalid_grant");
    const e = await refreshAegTokens("R1", rec(503, {}).fn, 0).catch((x) => x);
    expect(e.code).toBeUndefined();
    expect(e.message).not.toContain("R1");
  });
});
