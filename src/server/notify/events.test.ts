import { describe, expect, it } from "vitest";
import { aegSchema, skodaSchema } from "../providers/schemas";
import { detectEvents, nightOf } from "./events";

const T0 = new Date("2026-11-09T09:00:00Z"); // 10:00 svensk tid
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const car = (o: object = {}) => skodaSchema.parse({ rangeKm: 200, levelPct: 80, levelKind: "battery", locked: true, charging: false, parked: null, ...o });
const wash = (o: object = {}) => aegSchema.parse({ appliance: "Diskmaskin", state: "RUNNING", stateText: "Pågår", program: "Eco", phase: null, minutesLeft: 10, doneAt: null, connected: true, remoteControl: null, ...o });
const seen = (data: unknown, min = 0) => ({ data, fetchedAt: at(min) });

describe("AEG", () => {
  it("klar när maskinen går från pågår till klar", () => {
    const e = detectEvents("aeg", seen(wash()), wash({ state: "END_OF_CYCLE" }), at(1));
    expect(e).toEqual([{ kind: "aegDone", key: `aeg_done:${at(0).toISOString()}`, title: "Diskmaskin är klar", body: "Eco är färdigt." }]);
  });
  it("ingen notis om den redan var klar, om den fortfarande går eller vid första hämtningen", () => {
    expect(detectEvents("aeg", seen(wash({ state: "END_OF_CYCLE" })), wash({ state: "END_OF_CYCLE" }), at(1))).toEqual([]);
    expect(detectEvents("aeg", seen(wash()), wash(), at(1))).toEqual([]);
    expect(detectEvents("aeg", undefined, wash({ state: "END_OF_CYCLE" }), at(1))).toEqual([]);
  });
  it("ingen sen notis när förra mätningen är för gammal", () => {
    expect(detectEvents("aeg", seen(wash()), wash({ state: "END_OF_CYCLE" }), at(180))).toEqual([]);
  });
  it("två enheter som ser samma byte får samma nyckel", () => {
    const k = (n: number) => detectEvents("aeg", seen(wash()), wash({ state: "END_OF_CYCLE" }), at(n))[0]?.key;
    expect(k(1)).toBe(k(2));
  });
});

describe("Škoda laddning", () => {
  it("laddad när laddningen slutar vid målet", () => {
    const e = detectEvents("skoda", seen(car({ charging: true, levelPct: 79, chargeTargetPct: 80 })), car({ levelPct: 80 }), at(1));
    expect(e).toMatchObject([{ kind: "carCharged", title: "Bilen är laddad", body: "Batteriet är på 80 %." }]);
  });
  it("avbruten laddning långt under målet säger det", () => {
    const e = detectEvents("skoda", seen(car({ charging: true, levelPct: 40, chargeTargetPct: 80 })), car({ levelPct: 41 }), at(1));
    expect(e).toMatchObject([{ title: "Laddningen stoppade", body: "Batteriet är på 41 % (mål 80 %)." }]);
  });
  it("ingen notis när bilen inte laddade förut eller fortfarande laddar", () => {
    expect(detectEvents("skoda", seen(car()), car(), at(1))).toEqual([]);
    expect(detectEvents("skoda", seen(car({ charging: true })), car({ charging: true }), at(1))).toEqual([]);
    expect(detectEvents("skoda", undefined, car(), at(1))).toEqual([]);
  });
  it("för gammal jämförelse ger ingen laddnotis", () => {
    expect(detectEvents("skoda", seen(car({ charging: true })), car(), at(180))).toEqual([]);
  });
});

describe("Škoda olåst på natten", () => {
  const night = new Date("2026-11-08T23:30:00Z"); // 00:30 den 9 nov, natten som började 8 nov
  it("notis en gång per natt (samma nyckel hela natten)", () => {
    const a = detectEvents("skoda", undefined, car({ locked: false }), night);
    const b = detectEvents("skoda", undefined, car({ locked: false }), new Date("2026-11-09T04:00:00Z"));
    expect(a).toMatchObject([{ kind: "carUnlockedNight", key: "car_unlocked_night:2026-11-08" }]);
    expect(b[0]?.key).toBe("car_unlocked_night:2026-11-08");
  });
  it("kvällen före midnatt räknas till samma dygn som kvällen", () => {
    expect(nightOf(new Date("2026-11-08T21:30:00Z"))).toBe("2026-11-08"); // 22:30 den 8:e
    expect(nightOf(new Date("2026-11-08T22:30:00Z"))).toBe("2026-11-08"); // 23:30
  });
  it("inte på dagen, inte om bilen är låst, inte under körning", () => {
    expect(nightOf(T0)).toBeNull();
    expect(detectEvents("skoda", undefined, car({ locked: false }), T0)).toEqual([]);
    expect(detectEvents("skoda", undefined, car({ locked: true }), night)).toEqual([]);
    expect(detectEvents("skoda", undefined, car({ locked: false, driving: true }), night)).toEqual([]);
    expect(detectEvents("skoda", undefined, car({ locked: null }), night)).toEqual([]);
  });
});

it("andra tjänster och trasig data ger inget", () => {
  expect(detectEvents("sonos", seen({}), {}, at(1))).toEqual([]);
  expect(detectEvents("aeg", seen({ x: 1 }), { y: 2 }, at(1))).toEqual([]);
  expect(detectEvents("skoda", undefined, { y: 2 }, at(1))).toEqual([]);
});
