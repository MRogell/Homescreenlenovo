import { describe, expect, it } from "vitest";
import { ControlError, controlSpotify, listSpotifyDevices, transferSpotify } from "./spotify-control";

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

describe("controlSpotify without an active device", () => {
  type Route = { status: number; body?: unknown };
  function routed(routes: Record<string, Route>) {
    const calls: { key: string; body?: string }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      const key = `${init.method ?? "GET"} ${url.replace("https://api.spotify.com/v1", "")}`;
      calls.push({ key, body: init.body ? String(init.body) : undefined });
      const r = routes[key] ?? { status: 404, body: { error: { reason: "NO_ACTIVE_DEVICE" } } };
      return r.status === 204 ? new Response(null, { status: 204 }) : new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }
  const NO_DEVICE = { status: 404, body: { error: { status: 404, reason: "NO_ACTIVE_DEVICE" } } };
  const devices = (...d: { id: string; name: string; type?: string; is_restricted?: boolean }[]) => ({ status: 200, body: { devices: d.map((x) => ({ type: "Smartphone", is_restricted: false, is_active: false, ...x })) } });

  it("play with exactly one available device transfers playback to it and plays", async () => {
    const f = routed({ "PUT /me/player/play": NO_DEVICE, "GET /me/player/devices": devices({ id: "PHONE1", name: "Mickaels iPhone" }), "PUT /me/player": { status: 204 } });
    await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn });
    expect(f.calls.map((c) => c.key)).toEqual(["PUT /me/player/play", "GET /me/player/devices", "PUT /me/player"]);
    expect(JSON.parse(f.calls[2]!.body!)).toEqual({ device_ids: ["PHONE1"], play: true });
  });
  it("restricted devices are ignored", async () => {
    const f = routed({ "PUT /me/player/play": NO_DEVICE, "GET /me/player/devices": devices({ id: "R", name: "Låst", is_restricted: true }, { id: "OK", name: "Dator" }), "PUT /me/player": { status: 204 } });
    await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn });
    expect(JSON.parse(f.calls[2]!.body!).device_ids).toEqual(["OK"]);
  });
  it("several devices: asks the user to choose and lists them", async () => {
    const f = routed({ "PUT /me/player/play": NO_DEVICE, "GET /me/player/devices": devices({ id: "A", name: "Mickaels iPhone" }, { id: "B", name: "Vardagsrum", type: "Speaker" }) });
    const e = (await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn }).catch((x) => x)) as ControlError;
    expect(e.code).toBe("choose_device");
    expect(e.devices).toEqual([{ id: "A", name: "Mickaels iPhone", type: "Smartphone" }, { id: "B", name: "Vardagsrum", type: "Speaker" }]);
    expect(f.calls.map((c) => c.key)).not.toContain("PUT /me/player");
  });
  it("no available devices gives no_device with a clear hint", async () => {
    const f = routed({ "PUT /me/player/play": NO_DEVICE, "GET /me/player/devices": devices() });
    const e = (await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn }).catch((x) => x)) as ControlError;
    expect(e.code).toBe("no_device");
    expect(e.message).toMatch(/Spotify-appen/);
  });
  it("device list failing gives no_device", async () => {
    const f = routed({ "PUT /me/player/play": NO_DEVICE, "GET /me/player/devices": { status: 500 } });
    expect(((await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn }).catch((x) => x)) as ControlError).code).toBe("no_device");
  });
  it("play with a chosen device transfers directly without trying play first", async () => {
    const f = routed({ "PUT /me/player": { status: 204 } });
    await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn }, "B");
    expect(f.calls.map((c) => c.key)).toEqual(["PUT /me/player"]);
    expect(JSON.parse(f.calls[0]!.body!)).toEqual({ device_ids: ["B"], play: true });
  });
  it("next without active device does not transfer (nothing to skip on)", async () => {
    const f = routed({ "POST /me/player/next": NO_DEVICE });
    expect(((await controlSpotify("next", { getToken: async () => "TOK", fetchFn: f.fn }).catch((x) => x)) as ControlError).code).toBe("no_device");
    expect(f.calls).toHaveLength(1);
  });
  it("a failed transfer maps like other errors", async () => {
    const f = routed({ "PUT /me/player/play": NO_DEVICE, "GET /me/player/devices": devices({ id: "X", name: "Dator" }), "PUT /me/player": { status: 403, body: { error: { reason: "PREMIUM_REQUIRED" } } } });
    expect(((await controlSpotify("play", { getToken: async () => "TOK", fetchFn: f.fn }).catch((x) => x)) as ControlError).code).toBe("premium");
  });
});

describe("device switching", () => {
  function one(status: number, body?: unknown) {
    const calls: { key: string; body?: string }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ key: `${init.method ?? "GET"} ${url.replace("https://api.spotify.com/v1", "")}`, body: init.body ? String(init.body) : undefined });
      return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body ?? {}), { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }
  const deps = (f: { fn: typeof fetch }) => ({ getToken: async () => "TOK", fetchFn: f.fn });

  it("listSpotifyDevices returns devices with active flag and skips restricted ones", async () => {
    const f = one(200, { devices: [
      { id: "A", name: "WWMIRO", type: "Computer", is_active: true, is_restricted: false },
      { id: "B", name: "Mickaels iPhone", type: "Smartphone", is_active: false, is_restricted: false },
      { id: "C", name: "Låst högtalare", type: "Speaker", is_active: false, is_restricted: true },
    ] });
    expect(await listSpotifyDevices(deps(f))).toEqual([
      { id: "A", name: "WWMIRO", type: "Computer", active: true },
      { id: "B", name: "Mickaels iPhone", type: "Smartphone", active: false },
    ]);
    expect(f.calls[0]!.key).toBe("GET /me/player/devices");
  });
  it("listSpotifyDevices handles an empty or odd response", async () => {
    expect(await listSpotifyDevices(deps(one(200, { devices: [] })))).toEqual([]);
    expect(await listSpotifyDevices(deps(one(200, { devices: "nej" })))).toEqual([]);
    expect(await listSpotifyDevices(deps(one(200, {})))).toEqual([]);
  });
  it("listSpotifyDevices surfaces errors instead of hiding them", async () => {
    expect(((await listSpotifyDevices(deps(one(401))).catch((e) => e)) as ControlError).code).toBe("reauth");
    expect(((await listSpotifyDevices(deps(one(500))).catch((e) => e)) as ControlError).code).toBe("failed");
  });
  it("transferSpotify keeps playing or stays paused as asked", async () => {
    const a = one(204);
    await transferSpotify("B", true, deps(a));
    expect(a.calls).toEqual([{ key: "PUT /me/player", body: JSON.stringify({ device_ids: ["B"], play: true }) }]);
    const b = one(204);
    await transferSpotify("B", false, deps(b));
    expect(JSON.parse(b.calls[0]!.body!)).toEqual({ device_ids: ["B"], play: false });
  });
  it("transferSpotify maps errors", async () => {
    expect(((await transferSpotify("B", true, deps(one(404, { error: { reason: "NO_ACTIVE_DEVICE" } }))).catch((e) => e)) as ControlError).code).toBe("no_device");
  });
});
