import { describe, expect, it } from "vitest";
import { sonosView } from "./sonos-view";

const g = (over: Record<string, unknown> = {}) => ({ id: "G", room: "Kök", members: [] as string[], playing: false, title: "Inget spelas", artist: "", volume: 20 as number | null, imageUrl: null as string | null, ...over });

describe("sonosView", () => {
  it("the first playing room is the hero, every other room is a chip", () => {
    const v = sonosView([g({ id: "A", room: "Kök", playing: true, title: "Azizam", artist: "Ed Sheeran", volume: 30, imageUrl: "https://x.example.com/a.jpg" }), g({ id: "B", room: "Barnrum" }), g({ id: "C", room: "Vardagsrum - Höger", members: ["Vardagsrum - Vänster"], playing: true, title: "Kvart i fem", artist: "JULIETT" })]);
    expect(v.hero).toEqual({ id: "A", name: "Kök", extra: null, title: "Azizam", artist: "Ed Sheeran", imageUrl: "https://x.example.com/a.jpg", volume: 30 });
    expect(v.chips).toEqual([{ id: "B", label: "Barnrum", playing: false }, { id: "C", label: "Vardagsrum", playing: true }]);
  });
  it("nothing playing gives no hero and all rooms as chips, in the given order", () => {
    const v = sonosView([g({ id: "A", room: "Kök" }), g({ id: "B", room: "Barnrum" })]);
    expect(v.hero).toBeNull();
    expect(v.chips.map((c) => c.id)).toEqual(["A", "B"]);
  });
  it("a stereo pair is one room; a real group names the extra rooms", () => {
    expect(sonosView([g({ room: "Vardagsrum - Höger", members: ["Vardagsrum - Vänster"], playing: true })]).hero).toMatchObject({ name: "Vardagsrum", extra: null });
    expect(sonosView([g({ room: "Kök", members: ["Barnrum", "Hall - Vänster"], playing: true })]).hero).toMatchObject({ name: "Kök", extra: "Barnrum, Hall" });
    expect(sonosView([g({ id: "A", playing: true }), g({ id: "B", room: "Kök", members: ["Barnrum"] })]).chips[0]!.label).toBe("Kök + Barnrum");
  });
  it("an empty title becomes 'Inget spelas' and an unknown volume stays null", () => {
    expect(sonosView([g({ playing: true, title: "", volume: null })]).hero).toMatchObject({ title: "Inget spelas", volume: null });
  });
  it("no rooms gives an empty view", () => {
    expect(sonosView([])).toEqual({ hero: null, chips: [] });
  });
});
