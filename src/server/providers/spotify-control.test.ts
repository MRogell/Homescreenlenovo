import { describe, expect, it } from "vitest";
import { ControlError, controlSpotify } from "./spotify-control";

type Call = { url: string; method: string; auth: string };
function make(status: number, body?: unknown, headers?: Record<string, string>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), auth: (init.headers as Record<string, string>).Authorization! });
    return status === 204 ? new Response(null, { status }) : new Response(body === undefined ? "" : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const run = (action: Parameters<typeof controlSpotify>[0], f: ReturnType<typeof make>) => controlSpotify(action, { getToken: async () => "TOK", fetchFn: f.fn });
const err = async (p: Promise<unknown>) => (await p.catch((e) => e)) as ControlError;

describe("controlSpotify requests", () => {
  it.each([
    ["play", "PUT", "https://api.spotify.com/v1/me/player/play"],
    ["pause", "PUT", "https://api.spotify.com/v1/me/player/pause"],
    ["next", "POST", "https://api.spotify.com/v1/me/player/next"],
    ["previous", "POST", "https://api.spotify.com/v1/me/player/previous"],
  ] as const)("%s uses %s %s with bearer token", async (action, method, url) => {
    const f = make(204);
    await run(action, f);
    expect(f.calls).toEqual([{ url, method, auth: "Bearer TOK" }]);
  });
  it("accepts 200 and 202 as success", async () => {
    await expect(run("play", make(200))).resolves.toBeUndefined();
    await expect(run("pause", make(202))).resolves.toBeUndefined();
  });
});

describe("controlSpotify errors", () => {
  it("401 gives reauth", async () => expect((await err(run("play", make(401)))).code).toBe("reauth"));
  it("404 gives no_device", async () => {
    const e = await err(run("play", make(404, { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } })));
    expect(e.code).toBe("no_device");
    expect(e.message).toMatch(/enhet/);
  });
  it("403 PREMIUM_REQUIRED gives premium", async () => {
    expect((await err(run("play", make(403, { error: { status: 403, message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } })))).code).toBe("premium");
  });
  it("403 insufficient scope gives scope", async () => {
    expect((await err(run("play", make(403, { error: { status: 403, message: "Insufficient client scope" } })))).code).toBe("scope");
  });
  it("other 403 gives failed", async () => expect((await err(run("play", make(403, { error: { message: "annat" } })))).code).toBe("failed"));
  it("429 gives rate_limit", async () => expect((await err(run("next", make(429, undefined, { "Retry-After": "3" })))).code).toBe("rate_limit"));
  it("500 and non-JSON error bodies give failed", async () => {
    expect((await err(run("play", make(500, { x: 1 })))).code).toBe("failed");
    const f = make(502);
    expect((await err(run("play", f))).code).toBe("failed");
  });
  it("messages never contain the token", async () => {
    const e = await err(run("play", make(401)));
    expect(e.message).not.toContain("TOK");
  });
  it("network failure gives failed", async () => {
    const e = await err(controlSpotify("play", { getToken: async () => "TOK", fetchFn: (async () => { throw new Error("nere"); }) as unknown as typeof fetch }));
    expect(e).toBeInstanceOf(ControlError);
    expect(e.code).toBe("failed");
  });
});
