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
      forecastUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
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
      };
    },
  };
}
