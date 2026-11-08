import { aqiLabel, weatherText } from "@/lib/weather";
import { weatherSchema, type WeatherData } from "./schemas";
import type { Provider } from "./types";

// Open-Meteo: öppna väder- och luftkvalitetsdata, gratis för icke-kommersiellt bruk och utan nyckel.
// Fältnamn enligt deras dokumentation; källan kunde inte nås från byggmiljön (testad mot påhittade svar).
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";

export interface WeatherPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface WeatherDeps {
  getPlace: () => WeatherPlace;
  fetchFn?: typeof fetch;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const timeStr = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v : null);

/**
 * Prognosdelarna ur Open-Meteos svar. Trasiga eller saknade delar ger tomma listor och null, aldrig ett fel:
 * nuvädret ska visas även om prognosen är ofullständig. Tider är lokala (Europe/Stockholm).
 */
export function parseForecast(json: Record<string, unknown>) {
  const cur = rec(json.current);
  const hourly = rec(json.hourly);
  const daily = rec(json.daily);
  const currentHour = (timeStr(cur.time) ?? "").slice(0, 13);

  const times = list(hourly.time);
  const hours = times.flatMap((t, i) => {
    const time = timeStr(t);
    const tempC = num(list(hourly.temperature_2m)[i]);
    const code = num(list(hourly.weather_code)[i]);
    if (!time || tempC === null || code === null || !currentHour || time.slice(0, 13) < currentHour) return [];
    const rain = num(list(hourly.precipitation_probability)[i]);
    return [{ time, tempC, code, rainPct: rain, isDay: num(list(hourly.is_day)[i]) !== 0 }];
  }).slice(0, 24);

  const dates = list(daily.time);
  const days = dates.flatMap((d, i) => {
    const maxC = num(list(daily.temperature_2m_max)[i]);
    const minC = num(list(daily.temperature_2m_min)[i]);
    const code = num(list(daily.weather_code)[i]);
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || maxC === null || minC === null || code === null) return [];
    return [{ date: d, code, minC, maxC, rainMm: num(list(daily.precipitation_sum)[i]) }];
  }).slice(0, 5);

  const isDay = num(cur.is_day);
  return {
    isDay: isDay === null ? null : isDay !== 0,
    feelsLikeC: num(cur.apparent_temperature),
    gustMs: num(cur.wind_gusts_10m),
    hourly: hours,
    daily: days,
    sunrise: timeStr(list(daily.sunrise)[0]),
    sunset: timeStr(list(daily.sunset)[0]),
  };
}

export function createWeatherProvider(deps: WeatherDeps): Provider<WeatherData> {
  const fetchFn = deps.fetchFn ?? fetch;

  async function getJson(url: URL): Promise<Record<string, unknown>> {
    const res = await fetchFn(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`svar ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  return {
    id: "weather",
    ttlSeconds: 900,
    schema: weatherSchema,
    async getSummary() {
      const place = deps.getPlace();
      const forecastUrl = new URL(FORECAST);
      forecastUrl.searchParams.set("latitude", String(place.lat));
      forecastUrl.searchParams.set("longitude", String(place.lon));
      forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m");
      forecastUrl.searchParams.set("hourly", "temperature_2m,weather_code,precipitation_probability,is_day");
      forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset");
      forecastUrl.searchParams.set("forecast_days", "5");
      forecastUrl.searchParams.set("wind_speed_unit", "ms");
      forecastUrl.searchParams.set("timezone", "Europe/Stockholm");
      const airUrl = new URL(AIR);
      airUrl.searchParams.set("latitude", String(place.lat));
      airUrl.searchParams.set("longitude", String(place.lon));
      airUrl.searchParams.set("current", "european_aqi");
      airUrl.searchParams.set("timezone", "Europe/Stockholm");

      // Luftkvaliteten är valfri: misslyckas den visas vädret ändå.
      const [forecast, air] = await Promise.allSettled([getJson(forecastUrl), getJson(airUrl)]);
      if (forecast.status === "rejected") throw new Error("Vädertjänsten svarade inte");
      const cur = forecast.value.current as Record<string, unknown> | undefined;
      const tempC = num(cur?.temperature_2m);
      const code = num(cur?.weather_code);
      if (tempC === null || code === null) throw new Error("Vädertjänsten gav ett ofullständigt svar");
      const aqi = air.status === "fulfilled" ? num((air.value.current as Record<string, unknown> | undefined)?.european_aqi) : null;
      return {
        place: place.name,
        tempC,
        code,
        text: weatherText(code),
        windMs: num(cur?.wind_speed_10m),
        aqi: aqi === null ? null : Math.round(aqi),
        aqiLabel: aqi === null ? null : aqiLabel(aqi),
        ...parseForecast(forecast.value),
      };
    },
  };
}
