import { skodaSchema, type SkodaData } from "./schemas";
import type { Provider } from "./types";

// Škoda har inget öppet API. Appen läser från en liten Python-brygga (skoda-bridge/, eget Vercel-projekt)
// som använder det inofficiella biblioteket myskoda. Se docs/superpowers/specs/2026-11-07-skoda-brygga-design.md.

export interface SkodaBridgeConfig {
  url: string;
  token: string;
}

export interface SkodaDeps {
  getConfig: () => SkodaBridgeConfig | null;
  fetchFn?: typeof fetch;
}

// Bryggan loggar in hos Škoda vid behov, vilket kan ta flera sekunder.
const TIMEOUT_MS = 25_000;

/** Hur länge ett obekräftat klimatkommando räknas som väntande. */
export const CLIMATE_PENDING_MS = 10 * 60_000;

/** Sant när ett klimatkommando skickats nyligen och bilens rapporterade läge ännu inte stämmer med det. */
export function climatePending(d: SkodaData, now: Date): boolean {
  const r = d.climateRequested;
  if (!r) return false;
  const age = now.getTime() - new Date(r.at).getTime();
  if (!(age >= 0 && age < CLIMATE_PENDING_MS)) return false;
  return r.action === "start" ? d.climateOn !== true : d.climateOn !== false;
}

export function createSkodaProvider(deps: SkodaDeps): Provider<SkodaData> {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    id: "skoda",
    // Låg frekvens skyddar Škoda-kontot mot för många inloggningar.
    // Var 5:e minut normalt (i takt med Škoda-appen), var 2:a minut under laddning eller klimatisering. Bryggan loggar in högst var 100:e sekund.
    ttlSeconds: 300,
    ttlFor: (d) => (d.charging || d.climateOn || climatePending(d, new Date()) ? 120 : 300),
    timeoutMs: TIMEOUT_MS,
    schema: skodaSchema,
    isConnected: async () => deps.getConfig() !== null,
    async getSummary() {
      const config = deps.getConfig();
      if (!config) throw new Error("Saknar konfiguration");
      let res: Response;
      try {
        res = await fetchFn(`${config.url.replace(/\/+$/, "")}/api/skoda`, {
          headers: { Authorization: `Bearer ${config.token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        // Det underliggande felet kan innehålla adresser: visas inte.
        throw new Error("Kontakt med Škoda-bryggan misslyckades");
      }
      if (res.status === 401 || res.status === 403) throw new Error("Škoda-bryggan nekade åtkomst: kontrollera SKODA_BRIDGE_TOKEN");
      if (res.status === 429) throw new Error("Škoda-bryggan väntar mellan inloggningar, försök igen senare");
      if (res.status === 502) throw new Error("Škoda svarar inte just nu (kontrollera inloggningen eller försök senare)");
      if (res.status === 500) throw new Error("Škoda-bryggan saknar inställningar: kontrollera SKODA_USERNAME, SKODA_PASSWORD och SKODA_BRIDGE_TOKEN");
      if (!res.ok) throw new Error(`Škoda-bryggan svarade ${res.status}`);
      try {
        return (await res.json()) as SkodaData;
      } catch {
        throw new Error("Ogiltigt svar från Škoda-bryggan");
      }
    },
  };
}
