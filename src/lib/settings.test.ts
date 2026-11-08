import { describe, expect, it } from "vitest";
import { CARD_IDS, DEFAULT_SETTINGS, isNight, moveCard, normalizeSettings, resolveCards, settingsPatchSchema } from "./settings";

const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m); // lokal tid, så testen inte beror på tidszon

describe("defaults", () => {
  it("keep today's order, hide nothing, no saved place, night mode off 22:00-06:00", () => {
    expect(DEFAULT_SETTINGS).toEqual({ cards: { order: [...CARD_IDS], hidden: [] }, place: null, night: { enabled: false, from: "22:00", to: "06:00" } });
    expect(CARD_IDS).toEqual(["weather", "calendar", "skoda", "spotify", "sonos", "aeg", "tado"]);
  });
});

describe("normalizeSettings", () => {
  it("garbage and missing give the defaults", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { cards: 5, place: "x", night: [] }]) expect(normalizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a valid order, drops unknown and duplicate ids and appends missing cards in default order", () => {
    const s = normalizeSettings({ cards: { order: ["tado", "weather", "tado", "bogus", "aeg"], hidden: ["sonos", "sonos", "bogus"] } });
    expect(s.cards.order).toEqual(["tado", "weather", "aeg", "calendar", "skoda", "spotify", "sonos"]);
    expect(s.cards.hidden).toEqual(["sonos"]);
  });
  it("a valid place is kept, an invalid one becomes null", () => {
    expect(normalizeSettings({ place: { name: "Umeå", lat: 63.8, lon: 20.3 } }).place).toEqual({ name: "Umeå", lat: 63.8, lon: 20.3 });
    for (const place of [{ name: "", lat: 1, lon: 1 }, { name: "X", lat: 91, lon: 1 }, { name: "X", lat: 1, lon: 181 }, { name: "X", lat: "1", lon: 1 }, { lat: 1, lon: 1 }]) expect(normalizeSettings({ place }).place).toBeNull();
  });
  it("night mode: valid values are kept, invalid times fall back to the defaults", () => {
    expect(normalizeSettings({ night: { enabled: true, from: "21:30", to: "07:15" } }).night).toEqual({ enabled: true, from: "21:30", to: "07:15" });
    expect(normalizeSettings({ night: { enabled: true, from: "25:00", to: "x" } }).night).toEqual({ enabled: true, from: "22:00", to: "06:00" });
    expect(normalizeSettings({ night: { enabled: "ja" } }).night.enabled).toBe(false);
  });
});

describe("resolveCards", () => {
  it("returns the visible cards in the saved order", () => {
    const s = normalizeSettings({ cards: { order: ["spotify", "weather", "skoda", "sonos", "aeg", "tado", "calendar"], hidden: ["skoda", "tado"] } });
    expect(resolveCards(s)).toEqual(["spotify", "weather", "sonos", "aeg", "calendar"]);
  });
  it("everything hidden gives an empty list", () => {
    expect(resolveCards({ ...DEFAULT_SETTINGS, cards: { order: [...CARD_IDS], hidden: [...CARD_IDS] } })).toEqual([]);
  });
});

describe("isNight", () => {
  const night = (from: string, to: string, enabled = true) => ({ enabled, from, to });
  it("a window across midnight", () => {
    const n = night("22:00", "06:00");
    expect(isNight(at(22, 0), n)).toBe(true);
    expect(isNight(at(23, 30), n)).toBe(true);
    expect(isNight(at(0, 0), n)).toBe(true);
    expect(isNight(at(5, 59), n)).toBe(true);
    expect(isNight(at(6, 0), n)).toBe(false);
    expect(isNight(at(12, 0), n)).toBe(false);
    expect(isNight(at(21, 59), n)).toBe(false);
  });
  it("a window within one day", () => {
    const n = night("13:00", "15:00");
    expect(isNight(at(13, 0), n)).toBe(true);
    expect(isNight(at(14, 59), n)).toBe(true);
    expect(isNight(at(15, 0), n)).toBe(false);
    expect(isNight(at(12, 59), n)).toBe(false);
  });
  it("disabled, or the same from and to, is never night", () => {
    expect(isNight(at(23, 0), night("22:00", "06:00", false))).toBe(false);
    expect(isNight(at(23, 0), night("22:00", "22:00"))).toBe(false);
  });
});

describe("settingsPatchSchema", () => {
  const ok = (v: unknown) => settingsPatchSchema.safeParse(v).success;
  it("accepts each part on its own", () => {
    expect(ok({ cards: { order: [...CARD_IDS].reverse(), hidden: ["tado"] } })).toBe(true);
    expect(ok({ place: { name: "Umeå", lat: 63.8, lon: 20.3 } })).toBe(true);
    expect(ok({ place: null })).toBe(true);
    expect(ok({ night: { enabled: true, from: "22:00", to: "06:00" } })).toBe(true);
    expect(ok({ reset: true })).toBe(true);
  });
  it("rejects incomplete or duplicate orders, unknown cards and extra keys", () => {
    expect(ok({ cards: { order: ["weather"], hidden: [] } })).toBe(false);
    expect(ok({ cards: { order: ["weather", "weather", "calendar", "spotify", "sonos", "aeg", "tado"], hidden: [] } })).toBe(false);
    expect(ok({ cards: { order: [...CARD_IDS], hidden: ["bogus"] } })).toBe(false);
    expect(ok({ cards: { order: [...CARD_IDS], hidden: ["tado", "tado"] } })).toBe(false);
    expect(ok({ cards: { order: [...CARD_IDS], hidden: [], extra: 1 } })).toBe(false);
    expect(ok({ night: { enabled: true, from: "22:00", to: "06:00", x: 1 } })).toBe(false);
    expect(ok({ x: 1 })).toBe(false);
  });
  it("rejects bad places, bad times and an empty patch", () => {
    expect(ok({ place: { name: "X", lat: 91, lon: 0 } })).toBe(false);
    expect(ok({ place: { name: "X", lat: 0, lon: 181 } })).toBe(false);
    expect(ok({ place: { name: "  ", lat: 0, lon: 0 } })).toBe(false);
    expect(ok({ place: { name: "X".repeat(81), lat: 0, lon: 0 } })).toBe(false);
    expect(ok({ night: { enabled: true, from: "24:00", to: "06:00" } })).toBe(false);
    expect(ok({ night: { enabled: true, from: "6:00", to: "06:00" } })).toBe(false);
    expect(ok({})).toBe(false);
    expect(ok({ reset: false })).toBe(false);
  });
});

describe("moveCard", () => {
  const order = [...CARD_IDS];
  it("moves a card one step up or down", () => {
    expect(moveCard(order, "skoda", -1)).toEqual(["weather", "skoda", "calendar", "spotify", "sonos", "aeg", "tado"]);
    expect(moveCard(order, "skoda", 1)).toEqual(["weather", "calendar", "spotify", "skoda", "sonos", "aeg", "tado"]);
  });
  it("the first card cannot go up and the last cannot go down", () => {
    expect(moveCard(order, "weather", -1)).toEqual(order);
    expect(moveCard(order, "tado", 1)).toEqual(order);
  });
  it("does not change the original list and ignores unknown cards", () => {
    const copy = [...order];
    moveCard(order, "aeg", -1);
    expect(order).toEqual(copy);
    expect(moveCard(order, "bogus" as never, 1)).toEqual(order);
  });
});
