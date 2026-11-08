import { getAccessToken, getConnectionStatus } from "../connections";
import { getEnv } from "@/lib/env";
import { createSkodaProvider } from "./skoda";
import { getSettings } from "../settings";
import { skodaConfigFromEnv } from "./skoda-config";
import { createSonosProvider } from "./sonos";
import { createWeatherProvider } from "./weather";
import { createTadoProvider, type TadoCache } from "./tado";
import { createAegProvider, type AegCache } from "./aeg";
import { getAegApiKey } from "../aeg-connect";
import { db } from "../db";
import { createSpotifyProvider } from "./spotify";
import { createCalendarProvider } from "./calendar";
import { listCalendars } from "../calendar/store";
import type { Provider, ProviderId } from "./types";

const sonos = createSonosProvider({ getToken: () => getAccessToken("sonos"), isConnected: async () => (await getConnectionStatus("sonos")) === "ok" });
const spotify = createSpotifyProvider({ getToken: () => getAccessToken("spotify"), isConnected: async () => (await getConnectionStatus("spotify")) === "ok" });

const skoda = createSkodaProvider({ getConfig: () => skodaConfigFromEnv(getEnv()) });

const weather = createWeatherProvider({
  // Ortens namn och koordinater: den ägaren valt i Inställningar, annars miljövariablerna (reserv).
  getPlace: async () => {
    const saved = (await getSettings()).place;
    if (saved) return saved;
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

// AEG: apparaten (id och namn) sparas på anslutningen (connection.settings.appliance) och förnyas en gång per dygn.
async function updateSettings(provider: string, patch: Record<string, unknown>) {
  const row = await db.connection.findFirst({ where: { provider, status: "ok" }, select: { id: true, settings: true } });
  if (!row) return;
  const settings = row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? (row.settings as Record<string, unknown>) : {};
  await db.connection.update({ where: { id: row.id }, data: { settings: { ...settings, ...patch } as never } });
}
const aeg = createAegProvider({
  getToken: () => getAccessToken("aeg"),
  getApiKey: () => getAegApiKey(),
  isConnected: async () => (await getConnectionStatus("aeg")) === "ok",
  loadCache: async () => {
    const row = await db.connection.findFirst({ where: { provider: "aeg", status: "ok" }, select: { settings: true } });
    const c = (row?.settings as { appliance?: AegCache } | null)?.appliance;
    if (!c || typeof c.id !== "string" || typeof c.name !== "string" || typeof c.fetchedAt !== "number") return null;
    return { ...c, programs: Array.isArray(c.programs) ? c.programs.filter((p): p is string => typeof p === "string") : undefined };
  },
  saveCache: (appliance) => updateSettings("aeg", { appliance }),
});

// Kalendrarnas hemliga adresser ligger krypterade i databasen och dekrypteras här, bara på servern.
const calendar = createCalendarProvider({
  loadCalendars: async () => (await listCalendars(db, getEnv().BETTER_AUTH_SECRET)).map(({ id, name, color, url }) => ({ id, name, color, url })),
});

const ALL: Record<ProviderId, Provider<unknown>> = { calendar: calendar as Provider<unknown>, skoda: skoda as Provider<unknown>, sonos: sonos as Provider<unknown>, spotify: spotify as Provider<unknown>, weather: weather as Provider<unknown>, tado: tado as Provider<unknown>, aeg: aeg as Provider<unknown> };
export const PROVIDERS: Provider<unknown>[] = (["skoda", "sonos", "spotify", "aeg", "weather", "tado", "calendar"] as const).map((id) => ALL[id]);
