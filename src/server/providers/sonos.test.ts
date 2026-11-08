import { describe, expect, it } from "vitest";
import { sonosSchema } from "./schemas";
import { createSonosProvider, pickSonosImage } from "./sonos";
import { fakeFetch, type FakeRoute } from "./fake-fetch";

const H = "/households";
const players = [{ id: "P1", name: "Vardagsrum - Höger" }, { id: "P2", name: "Vardagsrum - Vänster" }, { id: "P3", name: "Kök" }, { id: "P4", name: "Barnrum" }];
const G = (id: string, coordinatorId: string, playerIds: string[], playbackState?: string) => ({ id, name: id, coordinatorId, playerIds, ...(playbackState ? { playbackState } : {}) });
const base = (groups: unknown[]): Record<string, FakeRoute> => ({ [H]: { body: { households: [{ id: "HH" }] } }, [`${H}/HH/groups`]: { body: { groups, players } } });
const meta = (g: string, body: unknown): Record<string, FakeRoute> => ({ [`/groups/${g}/playbackMetadata`]: { body } });
const vol = (g: string, v: number): Record<string, FakeRoute> => ({ [`/groups/${g}/groupVolume`]: { body: { volume: v } } });
const play = (g: string, state: string): Record<string, FakeRoute> => ({ [`/groups/${g}/playback`]: { body: { playbackState: state } } });
const track = (name: string, artist = "Artist") => ({ currentItem: { track: { name, artist: { name: artist } } } });
const make = (routes: Record<string, FakeRoute>) => {
  const f = fakeFetch(routes);
  return { p: createSonosProvider({ getToken: async () => "TOK", fetchFn: f.fn }), f };
};

describe("sonos provider (all rooms)", () => {
  it("lists every group with room name, members, track and volume; playing first", async () => {
    const { p } = make({
      ...base([G("A", "P3", ["P3"], "PLAYBACK_STATE_PAUSED"), G("B", "P1", ["P1", "P2"], "PLAYBACK_STATE_PLAYING"), G("C", "P4", ["P4"], "PLAYBACK_STATE_IDLE")]),
      ...meta("A", track("Kvart i fem", "JULIETT")), ...vol("A", 12),
      ...meta("B", track("Funeral", "Teddy Swims")), ...vol("B", 30),
      ...meta("C", {}), ...vol("C", 8),
    });
    const d = await p.getSummary();
    expect(d.groups).toEqual([
      { id: "B", room: "Vardagsrum - Höger", members: ["Vardagsrum - Vänster"], playing: true, title: "Funeral", artist: "Teddy Swims", volume: 30, imageUrl: null },
      { id: "C", room: "Barnrum", members: [], playing: false, title: "Inget spelas", artist: "", volume: 8, imageUrl: null },
      { id: "A", room: "Kök", members: [], playing: false, title: "Kvart i fem", artist: "JULIETT", volume: 12, imageUrl: null },
    ]);
    expect(sonosSchema.safeParse(d).success).toBe(true);
  });
  it("asks /playback when a group has no playbackState", async () => {
    const { p } = make({ ...base([G("A", "P3", ["P3"])]), ...play("A", "PLAYBACK_STATE_PLAYING"), ...meta("A", track("X")), ...vol("A", 1) });
    expect((await p.getSummary()).groups[0]!.playing).toBe(true);
  });
  it("radio container name is used when there is no track name", async () => {
    const { p } = make({ ...base([G("A", "P3", ["P3"], "PLAYBACK_STATE_PLAYING")]), ...meta("A", { container: { name: "P3 Radio" } }), ...vol("A", 1) });
    expect((await p.getSummary()).groups[0]!.title).toBe("P3 Radio");
  });
  it("a group whose metadata or volume fails is still listed", async () => {
    const { p } = make({ ...base([G("A", "P3", ["P3"], "PLAYBACK_STATE_PAUSED")]), [`/groups/A/playbackMetadata`]: { status: 500 }, [`/groups/A/groupVolume`]: { status: 500 } });
    expect((await p.getSummary()).groups[0]).toMatchObject({ room: "Kök", title: "Inget spelas", volume: null });
  });
  it("no households, 401 and garbage throw clear errors", async () => {
    await expect(make({ [H]: { body: { households: [] } } }).p.getSummary()).rejects.toThrow(/hushåll/i);
    const err = await make({ [H]: { status: 401 } }).p.getSummary().catch((e) => e);
    expect(err.message).toMatch(/Sonos/);
    expect(err.message).not.toContain("TOK");
    await expect(make({ [H]: { body: { households: [{ id: "HH" }] } }, [`${H}/HH/groups`]: { raw: "null" } }).p.getSummary()).rejects.toThrow();
  });
  it("no groups gives an empty list, not an error", async () => {
    expect((await make(base([])).p.getSummary()).groups).toEqual([]);
  });
  it("lists every player with the group it belongs to (for choosing a room)", async () => {
    const { p } = make({ ...base([G("A", "P3", ["P3"], "PLAYBACK_STATE_PAUSED"), G("B", "P1", ["P1", "P2"], "PLAYBACK_STATE_PLAYING")]), ...meta("A", {}), ...vol("A", 1), ...meta("B", {}), ...vol("B", 2) });
    const d = await p.getSummary();
    expect(d.players).toEqual([
      { id: "P1", name: "Vardagsrum - Höger", groupId: "B" },
      { id: "P2", name: "Vardagsrum - Vänster", groupId: "B" },
      { id: "P3", name: "Kök", groupId: "A" },
      { id: "P4", name: "Barnrum", groupId: null },
    ]);
  });
  it("old cached payloads without players still parse", () => {
    expect(sonosSchema.parse({ groups: [] }).players).toEqual([]);
  });
  it("ttl is 30 s", () => expect(make({}).p.ttlSeconds).toBe(30));
});

describe("album art", () => {
  const withArt = (track: Record<string, unknown>, container?: Record<string, unknown>) => ({ currentItem: { track: { name: "X", artist: { name: "A" }, ...track } }, ...(container ? { container } : {}) });
  it("the track image is used and reaches the card data", async () => {
    const { p } = make({ ...base([G("A", "P3", ["P3"], "PLAYBACK_STATE_PLAYING")]), ...meta("A", withArt({ imageUrl: "https://cdn.example.com/cover.jpg" })), ...vol("A", 10) });
    const d = await p.getSummary();
    expect(d.groups[0]!.imageUrl).toBe("https://cdn.example.com/cover.jpg");
    expect(sonosSchema.safeParse(d).success).toBe(true);
  });
  it("falls back to the first image in images, then to the container image", () => {
    expect(pickSonosImage({ images: [{ url: "https://a.example.com/1.jpg" }] }, undefined)).toBe("https://a.example.com/1.jpg");
    expect(pickSonosImage({}, { imageUrl: "https://b.example.com/c.jpg" })).toBe("https://b.example.com/c.jpg");
    expect(pickSonosImage({ imageUrl: "https://t.example.com/t.jpg" }, { imageUrl: "https://b.example.com/c.jpg" })).toBe("https://t.example.com/t.jpg");
  });
  it("only https is accepted; insecure, odd or too long addresses give null", () => {
    for (const url of ["http://x.example.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://x/y", "inte en adress", "", `https://x.example.com/${"a".repeat(600)}`]) {
      expect(pickSonosImage({ imageUrl: url }, undefined), url).toBeNull();
    }
    expect(pickSonosImage(undefined, undefined)).toBeNull();
  });
  it("an insecure first choice falls through to a secure one", () => {
    expect(pickSonosImage({ imageUrl: "http://x.example.com/a.jpg", images: [{ url: "https://ok.example.com/b.jpg" }] }, undefined)).toBe("https://ok.example.com/b.jpg");
  });
  it("old cached payloads without imageUrl still parse", () => {
    expect(sonosSchema.parse({ groups: [{ id: "A", room: "Kök", members: [], playing: false, title: "x", artist: "", volume: 1 }] }).groups[0]!.imageUrl).toBeNull();
  });
});
