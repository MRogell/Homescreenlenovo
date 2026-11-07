import { getAccessToken, getConnectionStatus } from "../connections";
import { demoProviders } from "./demo";
import { getEnv } from "@/lib/env";
import { createSkodaProvider } from "./skoda";
import { skodaConfigFromEnv } from "./skoda-config";
import { createSonosProvider } from "./sonos";
import { createWeatherProvider } from "./weather";
import { createTadoProvider, type TadoCache } from "./tado";
import { db } from "../db";
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

// Tados hem och rum sparas på anslutningen (connection.settings.tado) och förnyas en gång per dygn.
const tado = createTadoProvider({
  getToken: () => getAccessToken("tado"),
  isConnected: async () => (await getConnectionStatus("tado")) === "ok",
  loadCache: async () => {
    const row = await db.connection.findFirst({ where: { provider: "tado", status: "ok" }, select: { settings: true } });
    const c = (row?.settings as { tado?: TadoCache } | null)?.tado;
    return c && typeof c.homeId === "number" && Array.isArray(c.zones) && typeof c.fetchedAt === "number" ? c : null;
  },
  saveCache: async (cache) => {
    const row = await db.connection.findFirst({ where: { provider: "tado", status: "ok" }, select: { id: true, settings: true } });
    if (!row) return;
    const settings = row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? (row.settings as Record<string, unknown>) : {};
    await db.connection.update({ where: { id: row.id }, data: { settings: { ...settings, tado: cache } as never } });
  },
});

const ALL: Record<ProviderId, Provider<unknown>> = { ...demoProviders, skoda: skoda as Provider<unknown>, sonos: sonos as Provider<unknown>, spotify: spotify as Provider<unknown>, weather: weather as Provider<unknown>, tado: tado as Provider<unknown> };
export const PROVIDERS: Provider<unknown>[] = (["skoda", "sonos", "spotify", "aeg", "arlo", "weather", "tado"] as const).map((id) => ALL[id]);
export { demoProviders };
