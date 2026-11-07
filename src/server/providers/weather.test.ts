import { describe, expect, it } from "vitest";
import { safeSummary } from "./safe";
import { createWeatherProvider } from "./weather";

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
    expect(await p.getSummary()).toEqual({ place: "Luleå", tempC: 7.2, code: 3, text: "Mulet", windMs: 4.4, aqi: 51, aqiLabel: "Måttlig" });
  });
  it("asks for the right fields, place and units", async () => {
    const { p, calls } = make({ status: 200, body: FORECAST }, { status: 200, body: AIR });
    await p.getSummary();
    const f = new URL(calls.find((u) => u.includes("api.open-meteo.com/v1/forecast"))!);
    expect(f.searchParams.get("latitude")).toBe("65.5848");
    expect(f.searchParams.get("longitude")).toBe("22.1547");
    expect(f.searchParams.get("current")).toBe("temperature_2m,weather_code,wind_speed_10m");
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
