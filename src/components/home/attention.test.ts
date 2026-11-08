import { describe, expect, it } from "vitest";
import { skodaSchema } from "@/server/providers/schemas";
import type { CardState } from "@/server/providers/types";
import { attentionLine } from "./attention";

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
