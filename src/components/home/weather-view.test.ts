import { describe, expect, it } from "vitest";
import { weatherSchema, type WeatherData } from "@/server/providers/schemas";
import { clockOf, dayLabel, nextHours, nowLocal, weatherView, wxIcon, wxTint } from "./weather-view";

const NOW = new Date("2026-11-08T11:05:00+01:00");

const hour = (h: number, over: Record<string, unknown> = {}) => ({ time: `2026-11-08T${String(h).padStart(2, "0")}:00`, tempC: 7 + h / 10, code: 3, rainPct: 20, isDay: true, ...over });
const day = (date: string, over: Record<string, unknown> = {}) => ({ date, code: 3, minC: 2, maxC: 7, rainMm: 0, ...over });
const base: WeatherData = weatherSchema.parse({
  place: "Luleå", tempC: 7.2, code: 3, text: "Mulet", windMs: 4.4, aqi: 24, aqiLabel: "Ganska bra",
  isDay: true, feelsLikeC: 4.1, gustMs: 9.3,
  hourly: [hour(10), hour(11), hour(12), hour(13), hour(14), hour(15), hour(16), hour(17), hour(18)],
  daily: [day("2026-11-08"), day("2026-11-09", { minC: -3, maxC: 1, rainMm: 3.4, code: 71 }), day("2026-11-10", { minC: 0, maxC: 4 }), day("2026-11-11"), day("2026-11-12")],
  sunrise: "2026-11-08T08:41", sunset: "2026-11-08T14:32",
});

describe("wxIcon", () => {
  it("maps WMO codes to icons, with day and night variants", () => {
    expect(wxIcon(0, true)).toBe("sun");
    expect(wxIcon(0, false)).toBe("moon");
    expect(wxIcon(1, true)).toBe("cloud-sun");
    expect(wxIcon(2, false)).toBe("cloud-moon");
    expect(wxIcon(3, true)).toBe("cloud");
    expect(wxIcon(45, true)).toBe("fog");
    expect(wxIcon(53, true)).toBe("drizzle");
    expect(wxIcon(63, true)).toBe("rain");
    expect(wxIcon(81, true)).toBe("rain");
    expect(wxIcon(73, true)).toBe("snow");
    expect(wxIcon(86, true)).toBe("snow");
    expect(wxIcon(95, true)).toBe("storm");
  });
  it("unknown code or unknown daylight falls back sensibly", () => {
    expect(wxIcon(999, true)).toBe("cloud");
    expect(wxIcon(0, null)).toBe("sun");
  });
  it("tints follow the weather", () => {
    expect(wxTint(0, true)).not.toBe(wxTint(0, false));
    expect(wxTint(63, true)).not.toBe(wxTint(3, true));
    expect(wxTint(999, true)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("nowLocal and nextHours", () => {
  it("formats the Stockholm local time as YYYY-MM-DDTHH:mm", () => {
    expect(nowLocal(NOW)).toBe("2026-11-08T11:05");
    expect(nowLocal(new Date("2026-11-08T23:30:00Z"))).toBe("2026-11-09T00:30");
  });
  it("picks the next full hours after now, six by default", () => {
    expect(nextHours(base.hourly, NOW).map((h) => h.label)).toEqual(["12", "13", "14", "15", "16", "17"]);
  });
  it("fewer hours left gives fewer entries and none gives none", () => {
    expect(nextHours(base.hourly, new Date("2026-11-08T17:30:00+01:00")).map((h) => h.label)).toEqual(["18"]);
    expect(nextHours(base.hourly, new Date("2026-11-08T20:00:00+01:00"))).toEqual([]);
    expect(nextHours([], NOW)).toEqual([]);
  });
  it("shows rounded temperature and rain chance", () => {
    expect(nextHours(base.hourly, NOW)[0]).toMatchObject({ label: "12", temp: "8°", rain: "20 %", icon: "cloud" });
    expect(nextHours([hour(12, { rainPct: 0 })], NOW)[0]!.rain).toBeNull();
    expect(nextHours([hour(12, { rainPct: null })], NOW)[0]!.rain).toBeNull();
  });
  it("night hours use the night icon", () => {
    expect(nextHours([hour(18, { code: 0, isDay: false })], NOW)[0]!.icon).toBe("moon");
  });
});

describe("dayLabel and clockOf", () => {
  it("today is Idag, others get the Swedish short weekday", () => {
    expect(dayLabel("2026-11-08", "2026-11-08")).toBe("Idag");
    expect(dayLabel("2026-11-09", "2026-11-08")).toBe("mån");
    expect(dayLabel("2026-11-14", "2026-11-08")).toBe("lör");
  });
  it("clockOf takes HH:MM from a local ISO string and ignores garbage", () => {
    expect(clockOf("2026-11-08T08:41")).toBe("08:41");
    expect(clockOf("2026-11-08T14:32:00+01:00")).toBe("14:32");
    expect(clockOf("")).toBeNull();
    expect(clockOf(null)).toBeNull();
    expect(clockOf("inte en tid")).toBeNull();
  });
});

describe("weatherView", () => {
  const v = weatherView(base, NOW);
  it("headline: icon, tint and feels-like only when it differs", () => {
    expect(v.icon).toBe("cloud");
    expect(v.feelsLike).toBe("Känns som 4°");
    expect(weatherView({ ...base, feelsLikeC: 7.4 }, NOW).feelsLike).toBeNull();
    expect(weatherView({ ...base, feelsLikeC: null }, NOW).feelsLike).toBeNull();
  });
  it("five days with Idag first, rounded range and rain only when it matters", () => {
    expect(v.days.map((d) => d.label)).toEqual(["Idag", "mån", "tis", "ons", "tors"].map((l, i) => (i === 0 ? l : ["mån", "tis", "ons", "tors"][i - 1])));
    expect(v.days[1]).toMatchObject({ min: "-3°", max: "1°", rain: "3,4 mm", icon: "snow" });
    expect(v.days[0]!.rain).toBeNull();
    expect(weatherView({ ...base, daily: [day("2026-11-08", { rainMm: 0.04 })] }, NOW).days[0]!.rain).toBeNull();
  });
  it("range bars span the whole period and are never empty", () => {
    for (const d of v.days) {
      expect(d.left).toBeGreaterThanOrEqual(0);
      expect(d.left + d.width).toBeLessThanOrEqual(100.0001);
      expect(d.width).toBeGreaterThan(0);
    }
    // Kallaste dagen börjar längst till vänster, varmaste slutar längst till höger.
    expect(v.days[1]!.left).toBe(0);
    expect(v.days[0]!.left + v.days[0]!.width).toBeCloseTo(100 * (7 - -3) / (7 - -3), 3);
  });
  it("identical temperatures give a visible bar, not NaN", () => {
    const w = weatherView({ ...base, daily: [day("2026-11-08", { minC: 5, maxC: 5 })] }, NOW);
    expect(Number.isFinite(w.days[0]!.left) && Number.isFinite(w.days[0]!.width)).toBe(true);
    expect(w.days[0]!.width).toBeGreaterThan(0);
  });
  it("sun line and wind line", () => {
    expect(v.sun).toEqual({ rise: "08:41", set: "14:32" });
    expect(weatherView({ ...base, sunrise: null }, NOW).sun).toBeNull();
    expect(v.wind).toBe("4 m/s, byar 9");
    expect(weatherView({ ...base, gustMs: null }, NOW).wind).toBe("4 m/s");
    expect(weatherView({ ...base, windMs: null, gustMs: null }, NOW).wind).toBeNull();
  });
  it("old payloads without the new fields still parse and give a plain view", () => {
    const old = weatherSchema.parse({ place: "Luleå", tempC: 7, code: 3, text: "Mulet", windMs: null, aqi: null, aqiLabel: null });
    const w = weatherView(old, NOW);
    expect(w).toMatchObject({ hours: [], days: [], sun: null, feelsLike: null, wind: null });
  });
});
