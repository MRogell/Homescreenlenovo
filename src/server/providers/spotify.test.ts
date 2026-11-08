import { describe, expect, it } from "vitest";
import { spotifySchema } from "./schemas";
import { createSpotifyProvider } from "./spotify";
import { fakeFetch, type FakeRoute } from "./fake-fetch";

const NOW = Date.parse("2026-11-07T18:00:00.000Z");
const make = (routes: Record<string, FakeRoute>) => {
  const f = fakeFetch(routes);
  return { p: createSpotifyProvider({ getToken: async () => "TOK", fetchFn: f.fn, nowMs: () => NOW }), f };
};
const player = (over: Record<string, unknown> = {}) => ({
  is_playing: true,
  device: { name: "Sonos Vardagsrum" },
  currently_playing_type: "track",
  item: { name: "Låt", artists: [{ name: "Artist A" }, { name: "Artist B" }] },
  ...over,
});

describe("spotify provider", () => {
  it("200 playing", async () => {
    const { p } = make({ "/me/player": { body: player() } });
    const d = await p.getSummary();
    expect(d).toEqual({ playing: true, title: "Låt", artist: "Artist A, Artist B", device: "Sonos Vardagsrum", lastPlayedAt: "2026-11-07T18:00:00.000Z", deviceRestricted: false, supportsVolume: false, volume: null });
    expect(spotifySchema.safeParse(d).success).toBe(true);
  });
  it("sends the bearer token", async () => {
    let auth = "";
    const fn = (async (_u: string, init: RequestInit) => { auth = (init.headers as Record<string, string>).Authorization!; return new Response(JSON.stringify(player())); }) as unknown as typeof fetch;
    await createSpotifyProvider({ getToken: async () => "TOK", fetchFn: fn, nowMs: () => NOW }).getSummary();
    expect(auth).toBe("Bearer TOK");
  });
  it("200 paused", async () => {
    const { p } = make({ "/me/player": { body: player({ is_playing: false }) } });
    expect(await p.getSummary()).toMatchObject({ playing: false, title: "Låt", lastPlayedAt: null });
  });
  it("204 falls back to recently-played", async () => {
    const { p } = make({ "/me/player": { status: 204 }, "/me/player/recently-played?limit=1": { body: { items: [{ played_at: "2026-11-07T16:51:00.000Z", track: { name: "Gammal", artists: [{ name: "X" }] } }] } } });
    expect(await p.getSummary()).toEqual({ playing: false, title: "Gammal", artist: "X", device: null, lastPlayedAt: "2026-11-07T16:51:00.000Z", deviceRestricted: false, supportsVolume: false, volume: null });
  });
  it('204 and empty history gives title "Inget spelas"', async () => {
    const { p } = make({ "/me/player": { status: 204 }, "/me/player/recently-played?limit=1": { body: { items: [] } } });
    expect(await p.getSummary()).toEqual({ playing: false, title: "Inget spelas", artist: "", device: null, lastPlayedAt: null, deviceRestricted: false, supportsVolume: false, volume: null });
  });
  it("podcast episode uses show name", async () => {
    const { p } = make({ "/me/player": { body: player({ currently_playing_type: "episode", item: { name: "Avsnitt 5", show: { name: "Podden" } } }) } });
    expect(await p.getSummary()).toMatchObject({ title: "Avsnitt 5", artist: "Podden" });
  });
  it('ad shows "Reklam"', async () => {
    const { p } = make({ "/me/player": { body: player({ currently_playing_type: "ad", item: null }) } });
    expect(await p.getSummary()).toMatchObject({ title: "Reklam", artist: "" });
  });
  it("item null does not crash", async () => {
    const { p } = make({ "/me/player": { body: player({ item: null }) }, "/me/player/recently-played?limit=1": { body: { items: [] } } });
    expect((await p.getSummary()).title).toBe("Inget spelas");
  });
  it("401 throws without leaking the token", async () => {
    const { p } = make({ "/me/player": { status: 401 } });
    const err = await p.getSummary().catch((e) => e);
    expect(err.message).toMatch(/Spotify/);
    expect(err.message).not.toContain("TOK");
  });
  it("429 throws with retry hint", async () => {
    const { p } = make({ "/me/player": { status: 429, headers: { "Retry-After": "7" } } });
    await expect(p.getSummary()).rejects.toThrow(/7 s/);
  });
  it("non-JSON 200 throws", async () => {
    const { p } = make({ "/me/player": { raw: "<html>" } });
    await expect(p.getSummary()).rejects.toThrow();
  });
  it("is registered with ttl 30", () => {
    expect(make({}).p.ttlSeconds).toBe(30);
    expect(make({}).p.id).toBe("spotify");
  });
});

describe("device capabilities", () => {
  it("reports whether the active device can be controlled and its volume", async () => {
    const { p } = make({ "/me/player": { body: player({ device: { id: "PC", name: "WWMIRO", is_restricted: false, supports_volume: true, volume_percent: 42 } }) } });
    expect(await p.getSummary()).toMatchObject({ device: "WWMIRO", deviceRestricted: false, supportsVolume: true, volume: 42 });
  });
  it("a restricted active device (e.g. iPhone) is flagged and gets no volume", async () => {
    const { p } = make({ "/me/player": { body: player({ device: { id: "PH", name: "iPhone", is_restricted: true, supports_volume: false, volume_percent: 100 } }) } });
    expect(await p.getSummary()).toMatchObject({ device: "iPhone", deviceRestricted: true, supportsVolume: false, volume: null });
  });
  it("supports_volume without a number gives no volume", async () => {
    const { p } = make({ "/me/player": { body: player({ device: { name: "X", supports_volume: true } }) } });
    expect(await p.getSummary()).toMatchObject({ supportsVolume: false, volume: null });
  });
});
