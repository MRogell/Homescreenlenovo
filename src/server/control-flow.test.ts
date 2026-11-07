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
  it("sonos is not supported yet and gives 404", async () => expect((await handleControl({ ...ok, provider: "sonos" }, deps().d)).status).toBe(404));
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
    expect(r.json).toEqual({ code: "no_device", error: "Öppna Spotify på någon enhet först." });
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
