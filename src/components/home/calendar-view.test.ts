import { describe, expect, it } from "vitest";
import type { CalendarData } from "@/server/providers/schemas";
import { calendarView } from "./calendar-view";

// Söndag 8 november 2026, svensk tid (UTC+1).
const at = (hm: string, day = "2026-11-08") => `${new Date(`${day}T${hm}:00+01:00`).toISOString()}`;
const timed = (title: string, s: string, e: string, calendarId = "fam", day = "2026-11-08") => ({ title, allDay: false, start: at(s, day), end: at(e, day), calendarId });
const allDay = (title: string, s: string, e: string, calendarId = "skola") => ({ title, allDay: true, start: s, end: e, calendarId });
const data = (today: CalendarData["today"]["events"], tomorrow: CalendarData["tomorrow"]["events"] = []): CalendarData => ({
  today: { date: "2026-11-08", events: today },
  tomorrow: { date: "2026-11-09", events: tomorrow },
  calendars: [{ id: "fam", name: "Familj", color: "blue" }, { id: "jobb", name: "Jobb", color: "green" }, { id: "skola", name: "Skola", color: "yellow" }],
  failed: 0,
});
const NOW = (hm: string) => new Date(`2026-11-08T${hm}:00+01:00`);

const TODAY = [timed("Tandläkare Elsa", "08:15", "09:00"), timed("Lunchmöte", "12:00", "13:00", "jobb"), timed("Fotboll", "17:30", "19:00"), timed("Föräldramöte", "19:30", "21:00", "skola")];
const TOMORROW = [allDay("Skogsdag", "2026-11-09", "2026-11-10"), timed("Veckomöte", "09:00", "10:00", "jobb", "2026-11-09"), timed("Middag hos mormor", "18:00", "20:00", "fam", "2026-11-09")];

describe("calendarView hero", () => {
  it("before the first event: the next event is the hero with minutes left", () => {
    const v = calendarView(data(TODAY, TOMORROW), NOW("07:20"));
    expect(v.hero).toEqual({ when: "Nästa · om 55 min", title: "Tandläkare Elsa", meta: "08:15–09:00 · Familj", color: "blue" });
    expect(v.later.map((e) => e.title)).toEqual(["Lunchmöte", "Fotboll", "Föräldramöte"]);
  });
  it("an event in progress is the hero and is marked ongoing", () => {
    const v = calendarView(data(TODAY, TOMORROW), NOW("08:30"));
    expect(v.hero).toMatchObject({ when: "Pågår nu", title: "Tandläkare Elsa" });
    expect(v.later[0]!.title).toBe("Lunchmöte");
  });
  it("hours and minutes in 'om'", () => {
    expect(calendarView(data(TODAY), NOW("09:30")).hero!.when).toBe("Nästa · om 2 h 30 min");
    expect(calendarView(data(TODAY), NOW("11:59")).hero!.when).toBe("Nästa · om 1 min");
  });
  it("past events are gone, and the hero is the next one", () => {
    const v = calendarView(data(TODAY, TOMORROW), NOW("12:30"));
    expect(v.hero).toMatchObject({ when: "Pågår nu", title: "Lunchmöte" });
    expect(v.later.map((e) => e.title)).toEqual(["Fotboll", "Föräldramöte"]);
  });
  it("when today is over, tomorrow's first event is the hero and is not repeated in the list", () => {
    const v = calendarView(data(TODAY, TOMORROW), NOW("21:30"));
    expect(v.hero).toEqual({ when: "Imorgon 09:00", title: "Veckomöte", meta: "09:00–10:00 · Jobb", color: "green" });
    expect(v.later).toEqual([]);
    expect(v.tomorrow.events.map((e) => e.title)).toEqual(["Middag hos mormor"]);
  });
  it("no hero when only all-day events are left", () => {
    expect(calendarView(data([allDay("Studiedag", "2026-11-08", "2026-11-09")], [allDay("Skogsdag", "2026-11-09", "2026-11-10")]), NOW("12:00")).hero).toBeNull();
  });
});

describe("calendarView lists and pill", () => {
  it("tomorrow shows one event while today still has a hero, and two when it does not", () => {
    expect(calendarView(data(TODAY, TOMORROW), NOW("07:20")).tomorrow.events.map((e) => e.title)).toEqual(["Veckomöte"]);
    const many = [...TOMORROW, timed("Tredje", "20:30", "21:00", "fam", "2026-11-09")];
    expect(calendarView(data([], many), NOW("07:20")).tomorrow.events).toHaveLength(2);
  });
  it("all-day events are listed separately for today and tomorrow", () => {
    const v = calendarView(data([allDay("Studiedag", "2026-11-08", "2026-11-09"), ...TODAY], TOMORROW), NOW("07:20"));
    expect(v.allDayToday).toEqual([{ title: "Studiedag", color: "yellow" }]);
    expect(v.tomorrow.allDay).toEqual([{ title: "Skogsdag", color: "yellow" }]);
  });
  it("the pill counts what is left today", () => {
    expect(calendarView(data(TODAY, TOMORROW), NOW("07:20")).pill).toBe("4 kvar idag");
    expect(calendarView(data(TODAY, TOMORROW), NOW("08:30")).pill).toBe("4 kvar idag"); // den som pågår räknas
    expect(calendarView(data(TODAY, TOMORROW), NOW("17:00")).pill).toBe("2 kvar idag");
    expect(calendarView(data(TODAY, TOMORROW), NOW("22:00")).pill).toBe("Klart för idag");
    expect(calendarView(data([], TOMORROW), NOW("12:00")).pill).toBe("Inget idag");
  });
  it("nothing today or tomorrow marks the card empty", () => {
    const v = calendarView(data([], []), NOW("12:00"));
    expect(v.empty).toBe(true);
    expect(v.hero).toBeNull();
    expect(calendarView(data([], TOMORROW), NOW("12:00")).empty).toBe(false);
  });
  it("rows show the time, a length and the calendar colour; unknown calendars fall back to blue", () => {
    const v = calendarView(data([timed("Okänd", "12:00", "13:30", "borta"), timed("Efter", "14:00", "14:45", "jobb")]), NOW("07:00"));
    expect(v.later[0]).toMatchObject({ time: "14:00", meta: "Jobb · 45 min", color: "green", title: "Efter" });
    expect(v.hero).toMatchObject({ title: "Okänd", meta: "12:00–13:30 · Kalender", color: "blue" });
  });
  it("times are shown in Swedish time, also across summer time", () => {
    const summer = { ...data([{ title: "Sommar", allDay: false, start: "2026-07-08T10:00:00.000Z", end: "2026-07-08T11:00:00.000Z", calendarId: "fam" }]), today: { date: "2026-07-08", events: [{ title: "Sommar", allDay: false, start: "2026-07-08T10:00:00.000Z", end: "2026-07-08T11:00:00.000Z", calendarId: "fam" }] } };
    expect(calendarView(summer, new Date("2026-07-08T08:00:00Z")).hero!.meta).toBe("12:00–13:00 · Familj");
  });
  it("a failed calendar shows a note", () => {
    expect(calendarView({ ...data(TODAY), failed: 1 }, NOW("07:00")).note).toBe("1 kalender svarade inte");
    expect(calendarView({ ...data(TODAY), failed: 2 }, NOW("07:00")).note).toBe("2 kalendrar svarade inte");
    expect(calendarView(data(TODAY), NOW("07:00")).note).toBeNull();
  });
});

describe("calendarView tak på antal rader", () => {
  const many = Array.from({ length: 9 }, (_, i) => timed(`Möte ${i + 1}`, `${String(8 + i).padStart(2, "0")}:00`, `${String(8 + i).padStart(2, "0")}:30`));
  it("senare idag visar högst fyra och räknar resten", () => {
    const v = calendarView(data(many), NOW("07:00"));
    expect(v.hero?.title).toBe("Möte 1");
    expect(v.later.map((e) => e.title)).toEqual(["Möte 2", "Möte 3", "Möte 4", "Möte 5"]);
    expect(v.laterMore).toBe(4);
  });
  it("precis fyra rader ger ingen räknare", () => {
    const v = calendarView(data(many.slice(0, 5)), NOW("07:00"));
    expect(v.later).toHaveLength(4);
    expect(v.laterMore).toBe(0);
  });
  it("heldagshändelser: högst tre idag och två imorgon, resten räknas", () => {
    const ad = (n: number, day = "2026-11-08") => Array.from({ length: n }, (_, i) => allDay(`Dag ${i}`, day, "2026-11-10"));
    const v = calendarView(data(ad(5), ad(4, "2026-11-09")), NOW("07:00"));
    expect(v.allDayToday).toHaveLength(3);
    expect(v.allDayMore).toBe(2);
    expect(v.tomorrow.allDay).toHaveLength(2);
    expect(v.tomorrow.more).toBe(2);
  });
  it("imorgon räknar även tidsatta händelser som inte får plats", () => {
    const tom = Array.from({ length: 5 }, (_, i) => timed(`M${i}`, `${String(9 + i).padStart(2, "0")}:00`, `${String(9 + i).padStart(2, "0")}:30`, "fam", "2026-11-09"));
    const v = calendarView(data([], tom), NOW("07:00"));
    expect(v.hero?.when).toBe("Imorgon 09:00");
    expect(v.tomorrow.events).toHaveLength(2);
    expect(v.tomorrow.more).toBe(2);
  });
});
