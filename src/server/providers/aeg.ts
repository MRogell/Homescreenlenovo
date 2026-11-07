import { aegStateText, programName } from "@/lib/aeg";
import { AEG_API } from "@/lib/aeg-auth";
import { aegSchema, type AegData } from "./schemas";
import type { Provider } from "./types";

// Electrolux Group utvecklar-API. Sökvägar och fält enligt officiella SDK:t (0.7.0); testat mot påhittade svar.
const CACHE_MAX_AGE_MS = 24 * 3_600_000;

export interface AegCache {
  id: string;
  name: string;
  fetchedAt: number;
}

export interface AegDeps {
  getToken: () => Promise<string>;
  getApiKey: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  isConnected?: () => Promise<boolean>;
  loadCache: () => Promise<AegCache | null>;
  saveCache: (cache: AegCache) => Promise<void>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function createAegProvider(deps: AegDeps): Provider<AegData> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.nowMs ?? Date.now;

  async function get(path: string, token: string, apiKey: string): Promise<unknown> {
    const res = await fetchFn(`${AEG_API}${path}`, { headers: { Authorization: `Bearer ${token}`, "x-api-key": apiKey }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) throw new Error("AEG nekade åtkomst: anslut igen i Inställningar");
    if (res.status === 429) throw new Error("AEG begränsar anropen, försöker igen strax");
    if (!res.ok) throw new Error(`AEG svarade ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new Error("Ogiltigt svar från AEG");
    }
  }

  async function appliance(token: string, apiKey: string): Promise<AegCache> {
    const cached = await deps.loadCache();
    if (cached && now() - cached.fetchedAt < CACHE_MAX_AGE_MS) return cached;
    const list = await get("/appliances", token, apiKey);
    const items = (Array.isArray(list) ? list : []).map(obj).filter((a): a is Json => !!a && !!str(a.applianceId));
    const chosen = items.find((a) => a.applianceType === "DW") ?? items[0];
    if (!chosen) throw new Error("Hittar ingen AEG-apparat på kontot");
    const fresh = { id: String(chosen.applianceId), name: str(chosen.applianceName) ?? "AEG", fetchedAt: now() };
    await deps.saveCache(fresh);
    return fresh;
  }

  return {
    id: "aeg",
    ttlSeconds: 60,
    schema: aegSchema,
    isConnected: deps.isConnected,
    async getSummary() {
      const [token, apiKey] = await Promise.all([deps.getToken(), deps.getApiKey()]);
      if (!apiKey) throw new Error("AEG saknar API-nyckel: anslut igen i Inställningar");
      const a = await appliance(token, apiKey);
      const st = obj(await get(`/appliances/${encodeURIComponent(a.id)}/state`, token, apiKey));
      const reported = obj(obj(st?.properties)?.reported) ?? {};
      const state = str(reported.applianceState) ?? "UNKNOWN";
      const seconds = typeof reported.timeToEnd === "number" && reported.timeToEnd > 0 ? reported.timeToEnd : null;
      const active = state === "RUNNING" || state === "PAUSED" || state === "DELAYED_START";
      return {
        appliance: a.name,
        state,
        stateText: aegStateText(state),
        program: programName(str(obj(reported.userSelections)?.programUID)),
        phase: programName(str(reported.cyclePhase)),
        minutesLeft: active && seconds !== null ? Math.round(seconds / 60) : null,
        doneAt: active && seconds !== null ? new Date(now() + seconds * 1000).toISOString() : null,
        connected: typeof st?.connectionState === "string" ? st.connectionState.toLowerCase() === "connected" : false,
        remoteControl: str(reported.remoteControl) ?? null,
      };
    },
  };
}
