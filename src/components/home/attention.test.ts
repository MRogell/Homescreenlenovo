import { describe, expect, it } from "vitest";
import { skodaSchema, weatherSchema } from "@/server/providers/schemas";
import type { CardState } from "@/server/providers/types";
import { attentionLine, attentionTone } from "./attention";

const ok = <T,>(data: T): CardState<T> => ({ status: "ok", data, fetchedAt: "2026-11-08T10:00:00.000Z" });
const car = (over: Record<string, unknown> = {}) => ok(skodaSchema.parse({ rangeKm: 300, levelPct: 70, levelKind: "battery", locked: true, charging: false, parked: "Hemma", doorsOpen: false, windowsOpen: false, trunkOpen: false, bonnetOpen: false, ...over }));
const down: CardState<unknown> = { status: "unavailable", reason: "x" };
const stale: CardState<unknown> = { status: "stale", data: {}, fetchedAt: "2026-11-08T09:00:00.000Z", reason: "x" };
const off: CardState<unknown> = { status: "not_connected" };

describe("attentionLine", () => {
  it("nothing to say gives null", () => {
    expect(attentionLine({ skoda: car(), spotify: ok({}), weather: ok({}) })).toBeNull();
    expect(attentionLine({})).toBeNull();
  });
  it("car: unlocked, open parts and low battery", () => {
    expect(attentionLine({ skoda: car({ locked: false }) })).toBe("Bilen står olåst");
    expect(attentionLine({ skoda: car({ doorsOpen: true }) })).toBe("Bilens dörr är öppen");
    expect(attentionLine({ skoda: car({ trunkOpen: true }) })).toBe("Bilens bagagelucka är öppen");
    expect(attentionLine({ skoda: car({ windowsOpen: true }) })).toBe("Bilens fönster är öppna");
    expect(attentionLine({ skoda: car({ bonnetOpen: true }) })).toBe("Bilens motorhuv är öppen");
    expect(attentionLine({ skoda: car({ levelPct: 18 }) })).toBe("Bilens batteri är lågt (18 %)");
  });
  it("low battery is fine while charging, for fuel cars and when the level is unknown", () => {
    expect(attentionLine({ skoda: car({ levelPct: 18, charging: true }) })).toBeNull();
    expect(attentionLine({ skoda: car({ levelPct: 5, levelKind: "fuel" }) })).toBeNull();
    expect(attentionLine({ skoda: car({ levelPct: null }) })).toBeNull();
  });
  it("unknown lock state never claims unlocked", () => {
    expect(attentionLine({ skoda: car({ locked: null }) })).toBeNull();
  });
  it("services that do not answer are listed in Swedish; not connected is silent", () => {
    expect(attentionLine({ spotify: down })).toBe("Spotify svarar inte just nu");
    expect(attentionLine({ weather: down, spotify: stale })).toBe("Väder och Spotify svarar inte just nu");
    expect(attentionLine({ weather: down, spotify: down, sonos: down })).toBe("Väder, Spotify och Sonos svarar inte just nu");
    expect(attentionLine({ spotify: off, sonos: off })).toBeNull();
  });
  it("car first, then services, at most two items and a count for the rest", () => {
    expect(attentionLine({ skoda: car({ locked: false }), spotify: down })).toBe("Bilen står olåst · Spotify svarar inte just nu");
    expect(attentionLine({ skoda: car({ locked: false, doorsOpen: true, levelPct: 10 }), spotify: down })).toBe("Bilens dörr är öppen · Bilens batteri är lågt (10 %) · +1");
  });
  it("an unlocked car with an open door only reports the open door", () => {
    expect(attentionLine({ skoda: car({ locked: false, doorsOpen: true }) })).toBe("Bilens dörr är öppen");
  });
});

describe("SMHI-varningar", () => {
  const NOW = new Date("2026-11-09T05:00:00Z"); // 06:00 svensk tid
  const w = (o: Record<string, unknown> = {}) => ({ id: 1, level: "yellow", levelText: "Gul", title: "Vind på kalfjället", area: "Norra Lapplandsfjällen", start: "2026-11-09T02:00:00Z", end: "2026-11-09T13:00:00Z", ...o });
  const wdata = (warnings: unknown) => weatherSchema.parse({ place: "Abisko", tempC: 1, code: 3, text: "Mulet", windMs: null, aqi: null, aqiLabel: null, warnings });
  const weather = (warnings: unknown) => ok(wdata(warnings));
  it("SMHI:s ord oförändrade, källa och sluttid", () => {
    expect(attentionLine({ weather: weather([w()]) }, NOW)).toBe("Gul varning (SMHI): Vind på kalfjället, till 14:00");
    expect(attentionTone({ weather: weather([w()]) }, NOW)).toBe("yellow");
  });
  it("varning som börjar senare säger när; annan dag visar veckodag", () => {
    expect(attentionLine({ weather: weather([w({ start: "2026-11-09T15:00:00Z" })]) }, NOW)).toBe("Gul varning (SMHI): Vind på kalfjället, från 16:00");
    expect(attentionLine({ weather: weather([w({ start: "2026-11-10T07:00:00Z" })]) }, NOW)).toBe("Gul varning (SMHI): Vind på kalfjället, från tis 08:00");
    expect(attentionLine({ weather: weather([w({ end: "2026-11-10T07:00:00Z" })]) }, NOW)).toBe("Gul varning (SMHI): Vind på kalfjället, till tis 08:00");
    expect(attentionLine({ weather: weather([w({ start: null, end: null })]) }, NOW)).toBe("Gul varning (SMHI): Vind på kalfjället");
  });
  it("utgången varning visas inte, inte heller när varningar saknas eller är null", () => {
    expect(attentionLine({ weather: weather([w({ end: "2026-11-09T04:00:00Z" })]) }, NOW)).toBeNull();
    expect(attentionLine({ weather: weather([]) }, NOW)).toBeNull();
    expect(attentionLine({ weather: weather(null) }, NOW)).toBeNull();
    expect(attentionTone({ weather: weather([]) }, NOW)).toBeNull();
  });
  it("allvarligast bestämmer färgen; varningar före bilen; högst två plus antal", () => {
    const list = [w({ id: 2, level: "red", levelText: "Röd", title: "Storm" }), w()];
    expect(attentionTone({ weather: weather(list) }, NOW)).toBe("red");
    expect(attentionLine({ weather: weather(list), skoda: car({ locked: false }) }, NOW)).toBe("Röd varning (SMHI): Storm, till 14:00 · Gul varning (SMHI): Vind på kalfjället, till 14:00 · +1");
  });
  it("gammal data (stale) visar fortfarande varningen, men väder som inte svarar gör det inte", () => {
    const st: CardState<unknown> = { status: "stale", data: wdata([w()]), fetchedAt: "2026-11-09T04:00:00.000Z", reason: "x" };
    expect(attentionLine({ weather: st }, NOW)).toBe("Gul varning (SMHI): Vind på kalfjället, till 14:00 · Väder svarar inte just nu");
    expect(attentionLine({ weather: down }, NOW)).toBe("Väder svarar inte just nu");
  });
});
