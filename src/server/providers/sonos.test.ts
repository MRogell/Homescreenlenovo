import { describe, expect, it } from "vitest";
import { sonosSchema } from "./schemas";
import { createSonosProvider } from "./sonos";
import { fakeFetch, type FakeRoute } from "./fake-fetch";

const H = "/households";
const players = [{ id: "P1", name: "Vardagsrum" }, { id: "P2", name: "Köket" }, { id: "P3", name: "Sovrum" }];
const G = (id: string, coordinatorId: string, playerIds: string[], playbackState?: string) => ({ id, name: id, coordinatorId, playerIds, ...(playbackState ? { playbackState } : {}) });
const base = (groups: unknown[]): Record<string, FakeRoute> => ({
  [H]: { body: { households: [{ id: "HH" }] } },
  [`${H}/HH/groups`]: { body: { groups, players } },
});
const play = (g: string, state: string, position = 0): Record<string, FakeRoute> => ({ [`/groups/${g}/playback`]: { body: { playbackState: state, positionMillis: position } } });
const meta = (g: string, body: unknown): Record<string, FakeRoute> => ({ [`/groups/${g}/playbackMetadata`]: { body } });
const vol = (g: string, v: number): Record<string, FakeRoute> => ({ [`/groups/${g}/groupVolume`]: { body: { volume: v } } });
const make = (routes: Record<string, FakeRoute>) => {
  const f = fakeFetch(routes);
  return { p: createSonosProvider({ getToken: async () => "TOK", fetchFn: f.fn }), f };
};
const track = { currentItem: { track: { name: "Kvällsmys", artist: { name: "Band" }, durationMillis: 200_000 } } };

describe("sonos provider", () => {
  it("picks playing group", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"], "PLAYBACK_STATE_PAUSED"), G("B", "P3", ["P3"], "PLAYBACK_STATE_PLAYING")]), ...play("B", "PLAYBACK_STATE_PLAYING", 50_000), ...meta("B", track), ...vol("B", 22) });
    const d = await p.getSummary();
    expect(d).toEqual({ playing: true, title: "Kvällsmys", artist: "Band", room: "Sovrum", grouped: [], volume: 22, progressPct: 25 });
    expect(sonosSchema.safeParse(d).success).toBe(true);
  });
  it("falls back to first group", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"], "PLAYBACK_STATE_IDLE"), G("B", "P3", ["P3"], "PLAYBACK_STATE_IDLE")]), ...play("A", "PLAYBACK_STATE_IDLE"), ...meta("A", track), ...vol("A", 10) });
    const d = await p.getSummary();
    expect(d).toMatchObject({ playing: false, room: "Vardagsrum" });
  });
  it("asks /playback per group when groups lack playbackState", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"]), G("B", "P3", ["P3"])]), ...play("A", "PLAYBACK_STATE_IDLE"), ...play("B", "PLAYBACK_STATE_PLAYING"), ...meta("B", track), ...vol("B", 5) });
    expect(await p.getSummary()).toMatchObject({ playing: true, room: "Sovrum" });
  });
  it("grouped lists other players", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1", "P2"], "PLAYBACK_STATE_PLAYING")]), ...play("A", "PLAYBACK_STATE_PLAYING"), ...meta("A", track), ...vol("A", 30) });
    expect(await p.getSummary()).toMatchObject({ room: "Vardagsrum", grouped: ["Köket"] });
  });
  it("progressPct is 0 when duration is missing", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"], "PLAYBACK_STATE_PLAYING")]), ...play("A", "PLAYBACK_STATE_PLAYING", 9000), ...meta("A", { currentItem: { track: { name: "Radio" } } }), ...vol("A", 30) });
    expect((await p.getSummary()).progressPct).toBe(0);
  });
  it("progressPct is clamped to 100", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"], "PLAYBACK_STATE_PLAYING")]), ...play("A", "PLAYBACK_STATE_PLAYING", 999_999), ...meta("A", track), ...vol("A", 30) });
    expect((await p.getSummary()).progressPct).toBe(100);
  });
  it('missing currentItem gives "Inget spelas"', async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"], "PLAYBACK_STATE_IDLE")]), ...play("A", "PLAYBACK_STATE_IDLE"), ...meta("A", {}), ...vol("A", 12) });
    expect(await p.getSummary()).toMatchObject({ title: "Inget spelas", artist: "" });
  });
  it("uses container name for radio when track has no name", async () => {
    const { p } = make({ ...base([G("A", "P1", ["P1"], "PLAYBACK_STATE_PLAYING")]), ...play("A", "PLAYBACK_STATE_PLAYING"), ...meta("A", { container: { name: "P3 Radio" } }), ...vol("A", 12) });
    expect((await p.getSummary()).title).toBe("P3 Radio");
  });
  it("no households throws", async () => {
    const { p } = make({ [H]: { body: { households: [] } } });
    await expect(p.getSummary()).rejects.toThrow(/hushåll/i);
  });
  it("empty groups throws", async () => {
    const { p } = make(base([]));
    await expect(p.getSummary()).rejects.toThrow(/grupp/i);
  });
  it("401 throws without leaking the token", async () => {
    const { p } = make({ [H]: { status: 401 } });
    const err = await p.getSummary().catch((e) => e);
    expect(err.message).toMatch(/Sonos/);
    expect(err.message).not.toContain("TOK");
  });
  it("garbage JSON in groups throws instead of crashing", async () => {
    const { p } = make({ [H]: { body: { households: [{ id: "HH" }] } }, [`${H}/HH/groups`]: { body: null } });
    await expect(p.getSummary()).rejects.toThrow();
  });
  it("is registered with ttl 15", () => {
    expect(make({}).p.ttlSeconds).toBe(15);
    expect(make({}).p.id).toBe("sonos");
  });
});
