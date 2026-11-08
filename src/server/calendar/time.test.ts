import { describe, expect, it } from "vitest";
import { addLocalDays, dayWindow, localDate, startOfLocalDay, zonedToUtc } from "./time";

const TZ = "Europe/Stockholm";

describe("zonedToUtc", () => {
  it("winter time is UTC+1 and summer time is UTC+2", () => {
    expect(zonedToUtc({ y: 2026, m: 11, d: 8, h: 12, mi: 0, s: 0 }, TZ).toISOString()).toBe("2026-11-08T11:00:00.000Z");
    expect(zonedToUtc({ y: 2026, m: 7, d: 8, h: 12, mi: 0, s: 0 }, TZ).toISOString()).toBe("2026-07-08T10:00:00.000Z");
  });
  it("around the autumn change (2026-10-25, 03:00 -> 02:00) both sides resolve", () => {
    expect(zonedToUtc({ y: 2026, m: 10, d: 25, h: 1, mi: 0, s: 0 }, TZ).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(zonedToUtc({ y: 2026, m: 10, d: 25, h: 4, mi: 0, s: 0 }, TZ).toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });
  it("around the spring change (2026-03-29, 02:00 -> 03:00)", () => {
    expect(zonedToUtc({ y: 2026, m: 3, d: 29, h: 1, mi: 0, s: 0 }, TZ).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(zonedToUtc({ y: 2026, m: 3, d: 29, h: 4, mi: 0, s: 0 }, TZ).toISOString()).toBe("2026-03-29T02:00:00.000Z");
  });
});

describe("localDate and startOfLocalDay", () => {
  it("the date is the Swedish one, also just after local midnight when UTC is still the day before", () => {
    expect(localDate(new Date("2026-11-08T22:30:00Z"), TZ)).toBe("2026-11-08");
    expect(localDate(new Date("2026-11-08T23:30:00Z"), TZ)).toBe("2026-11-09");
  });
  it("start of the local day", () => {
    expect(startOfLocalDay(new Date("2026-11-08T15:00:00Z"), TZ).toISOString()).toBe("2026-11-07T23:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-07-08T15:00:00Z"), TZ).toISOString()).toBe("2026-07-07T22:00:00.000Z");
  });
});

describe("addLocalDays and dayWindow", () => {
  it("a day across the autumn change is 25 hours long", () => {
    const a = startOfLocalDay(new Date("2026-10-25T10:00:00Z"), TZ);
    const b = addLocalDays(a, 1, TZ);
    expect((b.getTime() - a.getTime()) / 3_600_000).toBe(25);
  });
  it("window: today, tomorrow and the end after tomorrow", () => {
    const w = dayWindow(new Date("2026-11-08T11:05:00Z"), TZ);
    expect(w.today).toBe("2026-11-08");
    expect(w.tomorrow).toBe("2026-11-09");
    expect(w.todayStart.toISOString()).toBe("2026-11-07T23:00:00.000Z");
    expect(w.tomorrowStart.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });
});
