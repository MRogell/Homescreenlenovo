import { describe, expect, it } from "vitest";
import { safeSummary } from "./safe";
import { createWeatherProvider, parseForecast } from "./weather";

const PLACE = { name: "Luleå", lat: 65.5848, lon: 22.1547 };
const FORECAST = { latitude: 65.58, longitude: 22.15, current: { time: "2026-11-08T10:00", temperature_2m: 7.2, weather_code: 3, wind_speed_10m: 4.4 } };
const AIR = { current: { time: "2026-11-08T10:00", european_aqi: 51 } };

function make(forecast: { status: number; body?: unknown }, air: { status: number; body?: unknown } | "throw") {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    if (url.includes("air-quality")) {
      if (air === "throw") throw new Error("nere");
      return new Response(JSON.stringify(air.body ?? {}), { status: air.status });
    }
    return new Response(typeof forecast.body === "string" ? forecast.body : JSON.stringify(forecast.body ?? {}), { status: forecast.status });
  }) as unknown as typeof fetch;
  return { p: createWeatherProvider({ getPlace: () => PLACE, fetchFn }), calls };
}

describe("weather provider", () => {
  it("combines forecast and air quality", async () => {
    const { p } = make({ status: 200, body: FORECAST }, { status: 200, body: AIR });
    expect(await p.getSummary()).toEqual({
      place: "Luleå", tempC: 7.2, code: 3, text: "Mulet", windMs: 4.4, aqi: 51, aqiLabel: "Måttlig",
      isDay: null, feelsLikeC: null, gustMs: null, hourly: [], daily: [], sunrise: null, sunset: null,
    });
  });
  it("asks for the right fields, place and units", async () => {
    const { p, calls } = make({ status: 200, body: FORECAST }, { status: 200, body: AIR });
    await p.getSummary();
    const f = new URL(calls.find((u) => u.includes("api.open-meteo.com/v1/forecast"))!);
    expect(f.searchParams.get("latitude")).toBe("65.5848");
    expect(f.searchParams.get("longitude")).toBe("22.1547");
    expect(f.searchParams.get("current")).toBe("temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m");
    expect(f.searchParams.get("hourly")).toBe("temperature_2m,weather_code,precipitation_probability,is_day");
    expect(f.searchParams.get("daily")).toBe("weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset");
    expect(f.searchParams.get("forecast_days")).toBe("5");
    expect(f.searchParams.get("wind_speed_unit")).toBe("ms");
    const a = new URL(calls.find((u) => u.includes("air-quality-api.open-meteo.com/v1/air-quality"))!);
    expect(a.searchParams.get("current")).toBe("european_aqi");
  });
  it("air quality failing still gives the weather with null aqi", async () => {
    for (const air of [{ status: 500 }, "throw" as const, { status: 200, body: { current: {} } }, { status: 200, body: { current: { european_aqi: null } } }]) {
      const { p } = make({ status: 200, body: FORECAST }, air);
      expect(await p.getSummary()).toMatchObject({ tempC: 7.2, aqi: null, aqiLabel: null });
    }
  });
  it("forecast failing throws (card becomes unavailable or stale)", async () => {
    await expect(make({ status: 500 }, { status: 200, body: AIR }).p.getSummary()).rejects.toThrow(/Väder/);
    await expect(make({ status: 200, body: "<html>" }, { status: 200, body: AIR }).p.getSummary()).rejects.toThrow();
    await expect(make({ status: 200, body: { current: { temperature_2m: "varmt" } } }, { status: 200, body: AIR }).p.getSummary()).rejects.toThrow();
  });
  it("valid data passes the card schema; ttl 15 min", async () => {
    const { p } = make({ status: 200, body: FORECAST }, { status: 200, body: AIR });
    expect((await safeSummary(p)).status).toBe("ok");
    expect(p.ttlSeconds).toBe(900);
    expect(p.id).toBe("weather");
  });
});

const FULL = {
  current: { time: "2026-11-08T11:15", temperature_2m: 7.2, apparent_temperature: 4.1, is_day: 1, weather_code: 3, wind_speed_10m: 4.4, wind_gusts_10m: 9.3 },
  hourly: {
    time: ["2026-11-08T10:00", "2026-11-08T11:00", "2026-11-08T12:00", "2026-11-08T13:00"],
    temperature_2m: [6.8, 7.1, 7.5, null],
    weather_code: [3, 3, 61, 61],
    precipitation_probability: [10, 20, null, 60],
    is_day: [1, 1, 1, 1],
  },
  daily: {
    time: ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"],
    weather_code: [3, 71, 3, 3, 3, 3],
    temperature_2m_max: [7, 1, 4, 3, 2, 2],
    temperature_2m_min: [2, -3, 0, 0, 0, 0],
    precipitation_sum: [0, 3.4, 0, 0.1, 0, 0],
    sunrise: ["2026-11-08T08:41", "2026-11-09T08:45", "", "", "", ""],
    sunset: ["2026-11-08T14:32", "2026-11-09T14:28", "", "", "", ""],
  },
};

describe("parseForecast", () => {
  it("keeps current details, hours from the current hour on and the first five days", () => {
    const f = parseForecast(FULL);
    expect(f).toMatchObject({ isDay: true, feelsLikeC: 4.1, gustMs: 9.3, sunrise: "2026-11-08T08:41", sunset: "2026-11-08T14:32" });
    // Timmar före den aktuella timmen (10:00) tas bort; 13:00 saknar temperatur och hoppas över.
    expect(f.hourly.map((h) => h.time)).toEqual(["2026-11-08T11:00", "2026-11-08T12:00"]);
    expect(f.hourly[1]).toEqual({ time: "2026-11-08T12:00", tempC: 7.5, code: 61, rainPct: null, isDay: true });
    expect(f.daily).toHaveLength(5);
    expect(f.daily[1]).toEqual({ date: "2026-11-09", code: 71, minC: -3, maxC: 1, rainMm: 3.4 });
  });
  it("missing or garbage parts give empty lists and nulls, never a throw", () => {
    for (const bad of [{}, { current: {}, hourly: null, daily: "x" }, { current: { time: 5 }, hourly: { time: "x" }, daily: { time: [1] } }]) {
      expect(parseForecast(bad as never)).toMatchObject({ hourly: [], daily: [], sunrise: null, sunset: null, isDay: null, feelsLikeC: null, gustMs: null });
    }
  });
  it("empty sunrise and sunset (polar night or midnight sun) are null", () => {
    const f = parseForecast({ ...FULL, daily: { ...FULL.daily, sunrise: ["", ""], sunset: ["", ""] } });
    expect(f.sunrise).toBeNull();
    expect(f.sunset).toBeNull();
  });
});

describe("weather provider forecast data", () => {
  it("passes the new fields through and still validates against the card schema", async () => {
    const { p } = make({ status: 200, body: FULL }, { status: 200, body: AIR });
    const d = await p.getSummary();
    expect(d.hourly).toHaveLength(2);
    expect(d.daily).toHaveLength(5);
    expect((await safeSummary(p)).status).toBe("ok");
  });
});
