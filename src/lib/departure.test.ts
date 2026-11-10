import { describe, expect, it } from "vitest";
import { currentSlot, daysText, decide, DEFAULT_DEPARTURE, departureView, normalizeDeparture, type DepartureSettings } from "./departure";

// Måndag 9 november 2026, svensk tid (UTC+1).
const at = (hm: string, day = "2026-11-09") => new Date(`${day}T${hm}:00+01:00`);
const on: DepartureSettings = { ...DEFAULT_DEPARTURE, enabled: true }; // 07:30 mån–fre, 15 min, under 5°
const only = (times: Record<string, string[]>): DepartureSettings => ({ ...on, times });
const cold = { tempC: -4, climateOn: false };

describe("decide", () => {
  it("av och icke-avresedagar", () => {
    expect(decide(DEFAULT_DEPARTURE, at("07:20"), cold)).toEqual({ kind: "off" });
    expect(decide(on, at("07:20", "2026-11-08"), cold)).toEqual({ kind: "idle" }); // söndag
  });
  it("väntar före startfönstret och säger när det börjar", () => {
    expect(decide(on, at("06:00"), cold)).toEqual({ kind: "wait", startsAt: "07:15" });
    expect(decide(on, at("07:14"), cold)).toEqual({ kind: "wait", startsAt: "07:15" });
  });
  it("startar i fönstret, från 07:15 till 5 minuter efter avresan", () => {
    expect(decide(on, at("07:15"), cold)).toEqual({ kind: "start" });
    expect(decide(on, at("07:30"), cold)).toEqual({ kind: "start" });
    expect(decide(on, at("07:35"), cold)).toEqual({ kind: "start" });
  });
  it("för sent: missad", () => {
    expect(decide(on, at("07:36"), cold)).toEqual({ kind: "missed" });
    expect(decide(on, at("12:00"), cold)).toEqual({ kind: "missed" });
  });
  it("hoppar över när det är varmare än gränsen, men startar på gränsen", () => {
    expect(decide(on, at("07:20"), { tempC: 5.5, climateOn: false })).toEqual({ kind: "skip", reason: "warm" });
    expect(decide(on, at("07:20"), { tempC: 5, climateOn: false })).toEqual({ kind: "start" });
  });
  it("okänd temperatur: hellre start än ingen start", () => {
    expect(decide(on, at("07:20"), { tempC: null, climateOn: false })).toEqual({ kind: "start" });
  });
  it("klimatet går redan: hoppa över", () => {
    expect(decide(on, at("07:20"), { tempC: -4, climateOn: true })).toEqual({ kind: "skip", reason: "on" });
  });
  it("hoppa över idag, men inte imorgon", () => {
    const s = { ...on, skipDate: "2026-11-09" };
    expect(decide(s, at("07:20"), cold)).toEqual({ kind: "skipped_user" });
    expect(decide(s, at("07:20", "2026-11-10"), cold)).toEqual({ kind: "start" });
  });
  it("redan startad eller överhoppad idag: gör inget mer", () => {
    for (const status of ["started", "skipped_warm", "skipped_on"] as const) {
      expect(decide({ ...on, last: { date: "2026-11-09", slot: 0, status, attempts: 1, at: 1, tempC: -4 } }, at("07:25"), cold).kind).toBe("done");
    }
  });
  it("en gårdagens körning hindrar inte idag", () => {
    expect(decide({ ...on, last: { date: "2026-11-06", slot: 0, status: "started", attempts: 1, at: 1, tempC: -4 } }, at("07:20"), cold)).toEqual({ kind: "start" });
  });
  it("misslyckad start försöks igen, högst tre gånger", () => {
    const failed = (attempts: number): DepartureSettings => ({ ...on, last: { date: "2026-11-09", slot: 0, status: "failed", attempts, at: 1, tempC: -4 } });
    expect(decide(failed(1), at("07:20"), cold)).toEqual({ kind: "start" });
    expect(decide(failed(2), at("07:20"), cold)).toEqual({ kind: "start" });
    expect(decide(failed(3), at("07:20"), cold).kind).toBe("done");
  });
  it("pågående start: vänta, men efter två minuter räknas den som fastnad", () => {
    const base = at("07:20").getTime();
    const s: DepartureSettings = { ...on, last: { date: "2026-11-09", slot: 0, status: "starting", attempts: 1, at: base, tempC: -4 } };
    expect(decide(s, new Date(base + 30_000), cold).kind).toBe("done");
    expect(decide(s, new Date(base + 3 * 60_000), cold)).toEqual({ kind: "start" });
  });
  it("sommartid: klockslaget är svensk tid", () => {
    const s = on;
    expect(decide(s, new Date("2026-07-06T07:20:00+02:00"), cold)).toEqual({ kind: "start" }); // måndag i juli
    expect(decide(s, new Date("2026-07-06T06:20:00+02:00"), cold)).toEqual({ kind: "wait", startsAt: "07:15" });
  });
  it("avresa strax efter midnatt: fönstret börjar vid 00:00 som tidigast", () => {
    const s = only({ "1": ["00:10"] });
    expect(decide(s, at("00:00"), cold)).toEqual({ kind: "start" });
  });
});

describe("normalizeDeparture", () => {
  it("skräp ger grundvärdet", () => {
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(normalizeDeparture(bad)).toEqual(DEFAULT_DEPARTURE);
  });
  it("tolkar giltiga värden och rättar ogiltiga", () => {
    const s = normalizeDeparture({ enabled: true, times: { "5": "06:45", "1": "07:00", "9": "08:00", "0": "08:00", "2": "25:00", "3": 5 }, leadMin: 20, belowC: 3.4, targetC: 22.3, skipDate: "2026-11-09", last: { date: "2026-11-09", slot: 0, status: "started", attempts: 2, at: 5, tempC: -2 } });
    expect(s).toMatchObject({ enabled: true, times: { "1": ["07:00"], "5": ["06:45"] }, leadMin: 20, belowC: 3, targetC: 22.5, skipDate: "2026-11-09" });
    expect(s.last).toEqual({ date: "2026-11-09", slot: 0, status: "started", attempts: 2, at: 5, tempC: -2 });
    expect(normalizeDeparture({ leadMin: 99, last: { date: "x", slot: 0, status: "okänd" } })).toMatchObject({ times: DEFAULT_DEPARTURE.times, leadMin: 15, last: null });
    expect(normalizeDeparture({ times: {} }).times).toEqual({}); // medvetet tomt: ingen dag vald
  });
});

describe("departureView", () => {
  it("texter för varje läge", () => {
    expect(departureView(DEFAULT_DEPARTURE, at("07:00"), cold)).toMatchObject({ line: "Förvärm till avresa", sub: "Av", tone: "idle" });
    expect(departureView(on, at("06:00"), cold)).toMatchObject({ line: "Avresa 07:30 · mån–fre", sub: "Startar 07:15 om det är 5° eller kallare (nu −4°)", tone: "wait" });
    expect(departureView(on, at("07:20", "2026-11-08"), cold).sub).toBe("Ingen avresa idag");
    expect(departureView({ ...on, last: { date: "2026-11-09", slot: 0, status: "started", attempts: 1, at: 1, tempC: -4 } }, at("07:20"), cold)).toMatchObject({ sub: "Klimatet startade · 21 °C klart 07:30", tone: "ok" });
    expect(departureView({ ...on, last: { date: "2026-11-09", slot: 0, status: "skipped_warm", attempts: 1, at: 1, tempC: 9 } }, at("07:20"), { tempC: 9, climateOn: false })).toMatchObject({ sub: "Hoppade över idag: 9° är varmare än gränsen 5°", tone: "warn" });
    expect(departureView(on, at("09:00"), cold)).toMatchObject({ tone: "bad" });
    expect(departureView({ ...on, skipDate: "2026-11-09" }, at("07:00"), cold)).toMatchObject({ sub: "Du hoppade över idag", settings: { skippedToday: true } });
    expect(departureView({ ...on, last: { date: "2026-11-09", slot: 0, status: "failed", attempts: 3, at: 1, tempC: -4 } }, at("07:20"), cold).tone).toBe("bad");
  });
  it("äldre format med en tid för flera dagar flyttas över", () => {
    expect(normalizeDeparture({ enabled: true, time: "06:30", days: [2, 4] }).times).toEqual({ "2": ["06:30"], "4": ["06:30"] });
  });
  it("olika tider per dag", () => {
    const s = only({ "1": ["07:30"], "2": ["07:30"], "3": ["07:30"], "4": ["07:30"], "5": ["07:30"], "6": ["09:30"] });
    // lördag 07:00: första fönstret börjar 09:15
    expect(decide(s, at("07:00", "2026-11-14"), cold)).toEqual({ kind: "wait", startsAt: "09:15" });
    expect(decide(s, at("09:20", "2026-11-14"), cold)).toEqual({ kind: "start" });
    expect(decide(s, at("07:20", "2026-11-09"), cold)).toEqual({ kind: "start" });
    expect(decide(s, at("09:20", "2026-11-15"), cold)).toEqual({ kind: "idle" }); // söndag saknas
  });
  it("raden: gemensam tid med dagar, annars dagens eller nästa avresa", () => {
    expect(departureView(on, at("06:00"), cold).line).toBe("Avresa 07:30 · mån–fre");
    const mixed = only({ "1": ["07:30"], "6": ["09:30"] });
    expect(departureView(mixed, at("06:00"), cold).line).toBe("Avresa idag 07:30");
    expect(departureView(mixed, at("06:00", "2026-11-10"), cold).line).toBe("Nästa avresa lör 09:30");
    expect(departureView(mixed, at("06:00", "2026-11-14"), cold).line).toBe("Avresa idag 09:30");
    expect(departureView(only({}), at("06:00"), cold).line).toBe("Inga dagar valda");
  });
  it("dagar skrivs kort", () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe("mån–fre");
    expect(daysText([1, 2, 3, 4, 5, 6, 7])).toBe("varje dag");
    expect(daysText([6, 7])).toBe("helger");
    expect(daysText([3, 1])).toBe("mån, ons");
  });
});

describe("två avresor på samma dag", () => {
  const two = only({ "1": ["07:30", "17:00"] });
  it("väntar på den första, sedan på den andra när den första är klar", () => {
    expect(decide(two, at("06:00"), cold)).toEqual({ kind: "wait", startsAt: "07:15" });
    expect(decide(two, at("07:20"), cold)).toEqual({ kind: "start" });
    const morningDone = { ...two, last: { date: "2026-11-09", slot: 0, status: "started" as const, attempts: 1, at: 1, tempC: -4 } };
    expect(decide(morningDone, at("07:40"), cold).kind).toBe("wait"); // nästa är kvällen
    expect(decide(morningDone, at("07:40"), cold)).toEqual({ kind: "wait", startsAt: "16:45" });
  });
  it("kvällens start är en egen körning och spärras inte av morgonens", () => {
    const morningDone = { ...two, last: { date: "2026-11-09", slot: 0, status: "started" as const, attempts: 1, at: 1, tempC: -4 } };
    expect(currentSlot(morningDone, at("16:50"), cold)).toEqual({ decision: { kind: "start" }, slot: 1 });
  });
  it("missad morgon hindrar inte kvällen, och är klar när båda är över", () => {
    expect(decide(two, at("12:00"), cold)).toEqual({ kind: "wait", startsAt: "16:45" });
    expect(decide(two, at("18:00"), cold)).toEqual({ kind: "missed" });
  });
  it("normaliseras: sorterade, unika, högst två", () => {
    expect(normalizeDeparture({ times: { "1": ["17:00", "07:30", "07:30", "12:00"] } }).times).toEqual({ "1": ["07:30", "12:00"] });
  });
  it("raden visar båda tiderna", () => {
    expect(departureView(two, at("06:00"), cold).line).toBe("Avresa 07:30 och 17:00 · mån");
  });
});
