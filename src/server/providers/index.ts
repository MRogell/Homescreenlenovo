import { getAccessToken, getConnectionStatus } from "../connections";
import { demoProviders } from "./demo";
import { getEnv } from "@/lib/env";
import { createSkodaProvider } from "./skoda";
import { skodaConfigFromEnv } from "./skoda-config";
import { createSonosProvider } from "./sonos";
import { createWeatherProvider } from "./weather";
import { createSpotifyProvider } from "./spotify";
import type { Provider, ProviderId } from "./types";

const sonos = createSonosProvider({ getToken: () => getAccessToken("sonos"), isConnected: async () => (await getConnectionStatus("sonos")) === "ok" });
const spotify = createSpotifyProvider({ getToken: () => getAccessToken("spotify"), isConnected: async () => (await getConnectionStatus("spotify")) === "ok" });

const skoda = createSkodaProvider({ getConfig: () => skodaConfigFromEnv(getEnv()) });

const weather = createWeatherProvider({
  getPlace: () => {
    const env = getEnv();
    return { name: env.WEATHER_PLACE, lat: env.WEATHER_LAT, lon: env.WEATHER_LON };
  },
});
weather.sourceLabel = "Öppen data (Open-Meteo)";

const ALL: Record<ProviderId, Provider<unknown>> = { ...demoProviders, skoda: skoda as Provider<unknown>, sonos: sonos as Provider<unknown>, spotify: spotify as Provider<unknown>, weather: weather as Provider<unknown> };
export const PROVIDERS: Provider<unknown>[] = (["skoda", "sonos", "spotify", "aeg", "arlo", "weather"] as const).map((id) => ALL[id]);
export { demoProviders };
