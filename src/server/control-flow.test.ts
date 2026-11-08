import { beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "./db";
import { handleControl, type ControlRequest } from "./control-flow";
import { ReauthRequired } from "./connections";

const db = createPrisma(process.env.DATABASE_URL);
const ok: ControlRequest = { provider: "spotify", body: { action: "pause" }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };

function deps(status = 204, body?: unknown) {
  const calls: string[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => { calls.push(`${init.method} ${url}`); return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body ?? {}), { status }); }) as unknown as typeof fetch;
  return { calls, d: { getToken: async () => "TOK", fetchFn, db } };
}

beforeEach(async () => {
  await db.snapshot.deleteMany();
  await db.snapshot.create({ data: { provider: "spotify", payload: {}, fetchedAt: new Date() } });
  await db.snapshot.create({ data: { provider: "tado", payload: {}, fetchedAt: new Date() } });
});

describe("handleControl", () => {
  it("unknown provider is 404", async () => expect((await handleControl({ ...ok, provider: "foo" }, deps().d)).status).toBe(404));
  it("arlo has no controls and gives 404", async () => expect((await handleControl({ ...ok, provider: "arlo" }, deps().d)).status).toBe(404));
  it("without session is 401 and makes no Spotify call", async () => {
    const x = deps();
    expect((await handleControl({ ...ok, userId: null }, x.d)).status).toBe(401);
    expect(x.calls).toHaveLength(0);
  });
  it("other origin is 403 and makes no Spotify call", async () => {
    const x = deps();
    expect((await handleControl({ ...ok, origin: "https://ond.example.com" }, x.d)).status).toBe(403);
    expect((await handleControl({ ...ok, origin: null }, x.d)).status).toBe(403);
    expect(x.calls).toHaveLength(0);
  });
  it("invalid action or body is 400", async () => {
    const x = deps();
    for (const body of [null, {}, { action: "volume" }, { action: 5 }, "play", [], { action: "play", extra: 1 }]) {
      expect((await handleControl({ ...ok, body }, x.d)).status, JSON.stringify(body)).toBe(400);
    }
    expect(x.calls).toHaveLength(0);
  });
  it("success is 204, calls Spotify and clears only the spotify snapshot", async () => {
    const x = deps(204);
    const r = await handleControl(ok, x.d);
    expect(r.status).toBe(204);
    expect(x.calls).toEqual(["PUT https://api.spotify.com/v1/me/player/pause"]);
    expect((await db.snapshot.findMany()).map((s) => s.provider)).toEqual(["tado"]);
  });
  it("failed command keeps the snapshot", async () => {
    await handleControl(ok, deps(500).d);
    expect(await db.snapshot.count()).toBe(2);
  });
  it("no active device is 409 with a Swedish message", async () => {
    const r = await handleControl(ok, deps(404, { error: { reason: "NO_ACTIVE_DEVICE" } }).d);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ code: "no_device", error: "Spotify hittar ingen enhet. Öppna Spotify-appen på telefonen eller datorn och försök igen." });
  });
  it("premium required is 403 and scope missing is 409", async () => {
    expect((await handleControl(ok, deps(403, { error: { reason: "PREMIUM_REQUIRED" } }).d)).status).toBe(403);
    expect((await handleControl(ok, deps(403, { error: { message: "Insufficient client scope" } }).d)).json?.code).toBe("scope");
  });
  it("rate limit is 429 and other failures are 502", async () => {
    expect((await handleControl(ok, deps(429).d)).status).toBe(429);
    expect((await handleControl(ok, deps(500).d)).status).toBe(502);
  });
  it("ReauthRequired from token lookup is 409 reauth", async () => {
    const r = await handleControl(ok, { db, getToken: async () => { throw new ReauthRequired(); } });
    expect(r.status).toBe(409);
    expect(r.json?.code).toBe("reauth");
  });
  it("unexpected errors from token lookup are 502 without details", async () => {
    const r = await handleControl(ok, { db, getToken: async () => { throw new Error("hemlig-detalj TOK"); } });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain("hemlig");
  });
});

describe("handleControl device choice", () => {
  const NO_DEVICE = new Response(JSON.stringify({ error: { reason: "NO_ACTIVE_DEVICE" } }), { status: 404 });
  it("play with a valid deviceId is accepted and transferred", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push(`${init.method} ${url} ${init.body ?? ""}`); return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    const r = await handleControl({ ...ok, body: { action: "play", deviceId: "abc123DEF" } }, { getToken: async () => "TOK", fetchFn, db });
    expect(r.status).toBe(204);
    expect(calls).toEqual(['PUT https://api.spotify.com/v1/me/player {"device_ids":["abc123DEF"],"play":true}']);
  });
  it("deviceId with odd characters, too long, or on another action is rejected", async () => {
    const d = { getToken: async () => "TOK", db };
    for (const body of [{ action: "play", deviceId: "../x" }, { action: "play", deviceId: "a".repeat(200) }, { action: "play", deviceId: "" }, { action: "pause", deviceId: "abc" }]) {
      expect((await handleControl({ ...ok, body }, d)).status, JSON.stringify(body)).toBe(400);
    }
  });
  it("several devices gives 409 choose_device with the list", async () => {
    const fetchFn = (async (url: string) => url.endsWith("/me/player/devices")
      ? new Response(JSON.stringify({ devices: [{ id: "A", name: "iPhone", type: "Smartphone", is_restricted: false }, { id: "B", name: "Vardagsrum", type: "Speaker", is_restricted: false }] }), { status: 200 })
      : NO_DEVICE.clone()) as unknown as typeof fetch;
    const r = await handleControl({ ...ok, body: { action: "play" } }, { getToken: async () => "TOK", fetchFn, db });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ code: "choose_device", devices: [{ id: "A", name: "iPhone" }, { id: "B", name: "Vardagsrum" }] });
  });
});

describe("handleControl device switching", () => {
  const LIST = { devices: [{ id: "A", name: "WWMIRO", type: "Computer", is_active: true, is_restricted: false }, { id: "B", name: "iPhone", type: "Smartphone", is_active: false, is_restricted: false }] };
  function fetchRec(status: number, body?: unknown) {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push(`${init.method ?? "GET"} ${url} ${init.body ?? ""}`.trim()); return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body ?? {}), { status }); }) as unknown as typeof fetch;
    return { calls, fetchFn };
  }
  it("devices returns 200 with the list and keeps the snapshot", async () => {
    const f = fetchRec(200, LIST);
    const r = await handleControl({ ...ok, body: { action: "devices" } }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ devices: [{ id: "A", name: "WWMIRO", type: "Computer", active: true, restricted: false }, { id: "B", name: "iPhone", type: "Smartphone", active: false, restricted: false }] });
    expect(await db.snapshot.count({ where: { provider: "spotify" } })).toBe(1);
  });
  it("transfer moves playback, keeps the play state and clears the spotify snapshot", async () => {
    const f = fetchRec(204);
    const r = await handleControl({ ...ok, body: { action: "transfer", deviceId: "B", play: false } }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db });
    expect(r.status).toBe(204);
    expect(f.calls).toEqual(['PUT https://api.spotify.com/v1/me/player {"device_ids":["B"],"play":false}']);
    expect(await db.snapshot.count({ where: { provider: "spotify" } })).toBe(0);
  });
  it("invalid device-switching bodies are 400 and make no Spotify call", async () => {
    const f = fetchRec(204);
    const d = { getToken: async () => "TOK", fetchFn: f.fetchFn, db };
    for (const body of [
      { action: "transfer", play: true },
      { action: "transfer", deviceId: "B" },
      { action: "transfer", deviceId: "B", play: "ja" },
      { action: "transfer", deviceId: "../x", play: true },
      { action: "devices", deviceId: "B" },
      { action: "devices", play: true },
      { action: "pause", play: true },
    ]) {
      expect((await handleControl({ ...ok, body }, d)).status, JSON.stringify(body)).toBe(400);
    }
    expect(f.calls).toHaveLength(0);
  });
  it("devices without session or with wrong origin is refused", async () => {
    const f = fetchRec(200, LIST);
    expect((await handleControl({ ...ok, userId: null, body: { action: "devices" } }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db })).status).toBe(401);
    expect((await handleControl({ ...ok, origin: "https://ond.example.com", body: { action: "devices" } }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db })).status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
});

describe("handleControl default device and backoff", () => {
  it("uses the stored default device when nothing is active", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method ?? "GET"} ${url} ${init.body ?? ""}`.trim());
      if (url.endsWith("/me/player/play")) return new Response(JSON.stringify({ error: { reason: "NO_ACTIVE_DEVICE" } }), { status: 404 });
      if (url.endsWith("/me/player/devices")) return new Response(JSON.stringify({ devices: [{ id: "PC", name: "WWMIRO", type: "Computer" }, { id: "PHONE1", name: "iPhone", type: "Smartphone" }] }), { status: 200 });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const r = await handleControl({ ...ok, body: { action: "play" } }, { getToken: async () => "TOK", fetchFn, db, getPreferred: async () => ({ id: "PHONE1", name: "iPhone" }) });
    expect(r.status).toBe(204);
    expect(calls.at(-1)).toBe('PUT https://api.spotify.com/v1/me/player {"device_ids":["PHONE1"],"play":true}');
  });
  it("a successful command clears a Spotify backoff", async () => {
    await db.providerBackoff.upsert({ where: { provider: "spotify" }, create: { provider: "spotify", reason: "x", until: new Date(Date.now() + 60_000) }, update: {} });
    const fetchFn = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await handleControl(ok, { getToken: async () => "TOK", fetchFn, db, getPreferred: async () => null });
    expect(await db.providerBackoff.count({ where: { provider: "spotify" } })).toBe(0);
  });
});

describe("handleControl sonos", () => {
  const sonosReq = { ...ok, provider: "sonos", body: { action: "pause", groupId: "RINCON_1:23" } };
  function rec(status: number) {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push(`${init.method} ${url}`); return new Response("{}", { status }); }) as unknown as typeof fetch;
    return { calls, fetchFn };
  }
  it("pause posts to the group and clears only the sonos snapshot", async () => {
    await db.snapshot.create({ data: { provider: "sonos", payload: {}, fetchedAt: new Date() } });
    const f = rec(200);
    const r = await handleControl(sonosReq, { getToken: async () => "TOK", fetchFn: f.fetchFn, db });
    expect(r.status).toBe(204);
    expect(f.calls).toEqual(["POST https://api.ws.sonos.com/control/api/v1/groups/RINCON_1%3A23/playback/pause"]);
    expect((await db.snapshot.findMany()).map((x) => x.provider).sort()).toEqual(["spotify", "tado"]);
  });
  it("invalid sonos bodies are 400 without any call", async () => {
    const f = rec(200);
    for (const body of [{ action: "pause" }, { action: "pause", groupId: "../x" }, { action: "volume", groupId: "G" }, { action: "pause", groupId: "G", extra: 1 }, { action: "devices" }, { action: "transfer", deviceId: "A", play: true }]) {
      expect((await handleControl({ ...sonosReq, body }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db })).status, JSON.stringify(body)).toBe(400);
    }
    expect(f.calls).toHaveLength(0);
  });
  it("session and origin are checked first", async () => {
    const f = rec(200);
    expect((await handleControl({ ...sonosReq, userId: null }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db })).status).toBe(401);
    expect((await handleControl({ ...sonosReq, origin: "https://ond.example.com" }, { getToken: async () => "TOK", fetchFn: f.fetchFn, db })).status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
  it("errors map to statuses with Swedish text", async () => {
    const r = await handleControl(sonosReq, { getToken: async () => "TOK", fetchFn: rec(404).fetchFn, db });
    expect(r.status).toBe(409);
    expect(r.json?.code).toBe("gone");
    expect((await handleControl(sonosReq, { getToken: async () => "TOK", fetchFn: rec(429).fetchFn, db })).status).toBe(429);
  });
});

describe("handleControl aeg", () => {
  const aegReq = { ...ok, provider: "aeg", body: { action: "pause" } };
  function rec(status: number) {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push(`${init.method} ${url} ${init.body}`); return new Response("{}", { status }); }) as unknown as typeof fetch;
    return { calls, fetchFn };
  }
  const d = (f: { fetchFn: typeof fetch }, appliance: string | null = "DW1") => ({ getToken: async () => "TOK", getApiKey: async () => "KEY", getAegApplianceId: async () => appliance, fetchFn: f.fetchFn, db });

  it("pause sends the command to the stored appliance and clears only the aeg snapshot", async () => {
    await db.snapshot.create({ data: { provider: "aeg", payload: {}, fetchedAt: new Date() } });
    const f = rec(200);
    expect((await handleControl(aegReq, d(f))).status).toBe(204);
    expect(f.calls).toEqual(['PUT https://api.developer.electrolux.one/api/v1/appliances/DW1/command {"executeCommand":"PAUSE"}']);
    expect((await db.snapshot.findMany()).map((x) => x.provider).sort()).toEqual(["spotify", "tado"]);
  });
  it("the client cannot choose the appliance; extra fields are 400", async () => {
    const f = rec(200);
    for (const body of [{ action: "pause", applianceId: "ANNAN" }, { action: "tvätta" }, {}, { action: "start", extra: 1 }]) {
      expect((await handleControl({ ...aegReq, body }, d(f))).status, JSON.stringify(body)).toBe(400);
    }
    expect(f.calls).toHaveLength(0);
  });
  it("no known appliance yet gives 409", async () => {
    const r = await handleControl(aegReq, d(rec(200), null));
    expect(r.status).toBe(409);
    expect(r.json?.code).toBe("no_appliance");
  });
  it("not allowed remotely gives 409 with a hint about remote start on the machine", async () => {
    const r = await handleControl({ ...aegReq, body: { action: "start" } }, d(rec(403)));
    expect(r.status).toBe(409);
    expect(r.json?.error).toMatch(/fjärrstart/i);
  });
  it("session and origin first", async () => {
    const f = rec(200);
    expect((await handleControl({ ...aegReq, userId: null }, d(f))).status).toBe(401);
    expect((await handleControl({ ...aegReq, origin: null }, d(f))).status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
});
