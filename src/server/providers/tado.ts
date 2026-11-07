import { tadoSchema, type TadoData } from "./schemas";
import type { Provider } from "./types";

// Tados klassiska REST-API (äldre generationen, V3/V3+). Fältnamn enligt community-bibliotek och Tados hjälpartikel;
// testat mot påhittade svar. Tado tillåter 100 anrop per dygn för vanliga konton, därför cachas hem och rum ett dygn.
const API = "https://my.tado.com/api/v2";
const ZONES_MAX_AGE_MS = 24 * 3_600_000;

export interface TadoCache {
  homeId: number;
  zones: { id: number; name: string }[];
  fetchedAt: number;
}

export interface TadoDeps {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  isConnected?: () => Promise<boolean>;
  loadCache: () => Promise<TadoCache | null>;
  saveCache: (cache: TadoCache) => Promise<void>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function createTadoProvider(deps: TadoDeps): Provider<TadoData> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.nowMs ?? Date.now;

  async function get(path: string, token: string): Promise<unknown> {
    const res = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 401) throw new Error("Tado nekade åtkomst: anslut igen i Inställningar");
    if (res.status === 429) throw new Error("Tado: dagens anropskvot är slut, försöker igen senare");
    if (!res.ok) throw new Error(`Tado svarade ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new Error("Ogiltigt svar från Tado");
    }
  }

  async function homeAndZones(token: string): Promise<TadoCache> {
    const cached = await deps.loadCache();
    if (cached && now() - cached.fetchedAt < ZONES_MAX_AGE_MS) return cached;
    const homes = obj(await get("/me", token))?.homes;
    const homeId = Array.isArray(homes) ? num(obj(homes[0])?.id) : null;
    if (homeId === null) throw new Error("Hittar inget Tado-hem");
    const zones = await get(`/homes/${homeId}/zones`, token);
    if (!Array.isArray(zones)) throw new Error("Ogiltigt svar från Tado");
    const heating = zones
      .map(obj)
      .filter((z): z is Json => !!z && z.type === "HEATING" && num(z.id) !== null && typeof z.name === "string")
      .map((z) => ({ id: z.id as number, name: z.name as string }));
    const fresh = { homeId, zones: heating, fetchedAt: now() };
    await deps.saveCache(fresh);
    return fresh;
  }

  return {
    id: "tado",
    ttlSeconds: 1200,
    failureBackoffMs: 600_000,
    schema: tadoSchema,
    isConnected: deps.isConnected,
    async getSummary() {
      const token = await deps.getToken();
      const { homeId, zones } = await homeAndZones(token);
      const states = obj(obj(await get(`/homes/${homeId}/zoneStates`, token))?.zoneStates) ?? {};
      const rooms = zones.map((z) => {
        const st = obj(states[String(z.id)]);
        const sensors = obj(st?.sensorDataPoints);
        const setting = obj(st?.setting);
        const temp = num(obj(sensors?.insideTemperature)?.celsius);
        const humidity = num(obj(sensors?.humidity)?.percentage);
        const power = num(obj(obj(st?.activityDataPoints)?.heatingPower)?.percentage);
        return {
          name: z.name,
          tempC: temp === null ? null : Math.round(temp * 10) / 10,
          humidity: humidity === null ? null : Math.round(humidity),
          targetC: setting?.power === "ON" ? num(obj(setting.temperature)?.celsius) : null,
          heating: power !== null && power > 0,
        };
      });
      rooms.sort((a, b) => a.name.localeCompare(b.name, "sv"));
      return { rooms };
    },
  };
}
