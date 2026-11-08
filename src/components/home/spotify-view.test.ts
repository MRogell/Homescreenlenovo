import { describe, expect, it } from "vitest";
import { estimateProgress, formatDuration, tintFromPixels } from "./spotify-view";

describe("formatDuration", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(61_900)).toBe("1:01");
    expect(formatDuration(208_000)).toBe("3:28");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("estimateProgress", () => {
  it("advances while playing and stops at the end", () => {
    expect(estimateProgress({ progressMs: 60_000, durationMs: 200_000, playing: true, elapsedMs: 5_000 })).toBe(65_000);
    expect(estimateProgress({ progressMs: 199_000, durationMs: 200_000, playing: true, elapsedMs: 5_000 })).toBe(200_000);
  });
  it("stays still when paused and is null without data", () => {
    expect(estimateProgress({ progressMs: 60_000, durationMs: 200_000, playing: false, elapsedMs: 5_000 })).toBe(60_000);
    expect(estimateProgress({ progressMs: null, durationMs: 200_000, playing: true, elapsedMs: 1 })).toBeNull();
    expect(estimateProgress({ progressMs: 1, durationMs: null, playing: true, elapsedMs: 1 })).toBeNull();
  });
});

describe("tintFromPixels", () => {
  it("averages colourful pixels and ignores near-black and near-white", () => {
    const px = new Uint8ClampedArray([200, 40, 40, 255, 0, 0, 0, 255, 255, 255, 255, 255, 180, 60, 40, 255]);
    expect(tintFromPixels(px)).toBe("rgb(190, 50, 40)");
  });
  it("returns null when nothing usable", () => {
    expect(tintFromPixels(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]))).toBeNull();
    expect(tintFromPixels(new Uint8ClampedArray([200, 40, 40, 0]))).toBeNull();
  });
});

import { buildDeviceList, findSonosGroup, type SonosInfo } from "./spotify-view";

const sonos: SonosInfo = {
  groups: [{ id: "GK", room: "Kök", members: [], volume: 30 }, { id: "GV", room: "Vardagsrum - Höger", members: ["Vardagsrum - Vänster"], volume: 12 }],
  players: [{ id: "PK", name: "Kök", groupId: "GK" }, { id: "PV1", name: "Vardagsrum - Höger", groupId: "GV" }, { id: "PV2", name: "Vardagsrum - Vänster", groupId: "GV" }, { id: "PB", name: "Barnrum", groupId: null }],
};

describe("findSonosGroup", () => {
  it("matches the Spotify device name to a Sonos room or member, case-insensitive", () => {
    expect(findSonosGroup("Kök", sonos)).toEqual({ id: "GK", volume: 30 });
    expect(findSonosGroup(" kök ", sonos)?.id).toBe("GK");
    expect(findSonosGroup("Vardagsrum - Vänster", sonos)?.id).toBe("GV");
  });
  it("Spotify's group names with '+ N' or a stereo-pair side still match", () => {
    expect(findSonosGroup("Vardagsrum - Höger + 1", sonos)?.id).toBe("GV");
    expect(findSonosGroup("Vardagsrum + 2", sonos)?.id).toBe("GV");
    expect(findSonosGroup("Kök + 1", sonos)?.id).toBe("GK");
    expect(findSonosGroup("Vardagsrum", sonos)?.id).toBe("GV");
  });
  it("no match, no device or no Sonos gives null", () => {
    expect(findSonosGroup("WWMIRO", sonos)).toBeNull();
    expect(findSonosGroup(null, sonos)).toBeNull();
    expect(findSonosGroup("Kök", null)).toBeNull();
    expect(findSonosGroup("Barnrum", sonos)).toBeNull();
  });
});

describe("buildDeviceList", () => {
  const spotify = [
    { id: "S1", name: "WWMIRO", type: "Computer", active: false },
    { id: "S2", name: "iPhone", type: "Smartphone", active: false },
    { id: "S3", name: "Kök", type: "Speaker", active: true, restricted: true },
  ];
  it("playing on Sonos: Spotify devices plus every Sonos room once; rooms move via Sonos", () => {
    const list = buildDeviceList(spotify, sonos, "GK");
    expect(list.map((d) => [d.name, d.kind, d.active, d.available])).toEqual([
      ["WWMIRO", "spotify", false, true],
      ["iPhone", "spotify", false, true],
      ["Kök", "sonos", true, true],
      ["Vardagsrum", "sonos", false, true],
      ["Barnrum", "sonos", false, true],
    ]);
    expect(list.find((d) => d.name === "Vardagsrum")?.playerId).toBe("PV1");
  });
  it("playing elsewhere: a room Spotify sees is moved by Spotify, other rooms are started by Sonos", () => {
    const list = buildDeviceList([{ id: "S1", name: "WWMIRO", type: "Computer", active: true }, { id: "S4", name: "Barnrum", type: "Speaker", active: false }], sonos, null);
    expect(list.map((d) => [d.name, d.kind, d.active, d.available, d.spotifyId ?? null, d.sonosGroupId ?? null])).toEqual([
      ["WWMIRO", "spotify", true, true, "S1", null],
      ["Kök", "sonos", false, true, null, "GK"],
      ["Vardagsrum", "sonos", false, true, null, "GV"],
      ["Barnrum", "sonos", false, true, "S4", null],
    ]);
  });
  it("a room without a group that Spotify cannot see is not selectable", () => {
    expect(buildDeviceList([], sonos, null).find((d) => d.name === "Barnrum")).toMatchObject({ available: false });
  });
  it("without Sonos it is just the Spotify list", () => {
    expect(buildDeviceList(spotify, null, null).map((d) => d.name)).toEqual(["WWMIRO", "iPhone", "Kök"]);
  });
});
