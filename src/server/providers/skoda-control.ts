import { skodaSchema, type SkodaData } from "./schemas";
import type { SkodaBridgeConfig } from "./skoda";

export type SkodaClimateCommand = { action: "climate_start"; temperatureC: number } | { action: "climate_stop" };
export type SkodaControlErrorCode = "throttled" | "failed" | "config";

const MESSAGES: Record<SkodaControlErrorCode, string> = {
  throttled: "Vänta en halv minut och försök igen",
  failed: "Bilen tog inte emot kommandot",
  config: "Škoda-bryggan är inte konfigurerad",
};

export class SkodaControlError extends Error {
  constructor(public code: SkodaControlErrorCode) {
    super(MESSAGES[code]);
    this.name = "SkodaControlError";
  }
}

// Bryggan loggar in, skickar kommandot och läser av bilen i samma anrop.
const TIMEOUT_MS = 45_000;

/** Skickar klimatkommandot till bryggan och returnerar bilens nya sammanfattning. Fel innehåller aldrig token eller svarstext. */
export async function sendSkodaClimate(cmd: SkodaClimateCommand, deps: { getConfig: () => SkodaBridgeConfig | null; fetchFn?: typeof fetch }): Promise<SkodaData> {
  const config = deps.getConfig();
  if (!config) throw new SkodaControlError("config");
  const body = cmd.action === "climate_start" ? { climate: "start", temperatureC: cmd.temperatureC } : { climate: "stop" };
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(`${config.url.replace(/\/+$/, "")}/api/skoda`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SkodaControlError("failed");
  }
  if (res.status === 429) throw new SkodaControlError("throttled");
  if (res.status === 401 || res.status === 403 || res.status === 500) throw new SkodaControlError("config");
  if (!res.ok) throw new SkodaControlError("failed");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SkodaControlError("failed");
  }
  const parsed = skodaSchema.safeParse(json);
  if (!parsed.success) throw new SkodaControlError("failed");
  return parsed.data;
}
