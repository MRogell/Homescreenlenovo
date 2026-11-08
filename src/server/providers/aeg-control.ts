import { AEG_API } from "@/lib/aeg-auth";

// Kommandon enligt officiella SDK:t (electrolux-group-developer-sdk 0.7.0): PUT /appliances/{id}/command med
// {"executeCommand": "START" | "PAUSE" | "RESUME" | "STOPRESET"}; DAM-apparater (id börjar med "1:") kräver {"commands": [...]}.
export type AegAction = "start" | "pause" | "resume" | "stop";
export const AEG_ACTIONS: readonly AegAction[] = ["start", "pause", "resume", "stop"];
export type AegErrorCode = "reauth" | "not_allowed" | "program_locked" | "rate_limit" | "failed";

const COMMANDS: Record<AegAction, string> = { start: "START", pause: "PAUSE", resume: "RESUME", stop: "STOPRESET" };
const MESSAGES: Record<AegErrorCode, string> = {
  reauth: "Anslut AEG igen i Inställningar.",
  not_allowed: "Diskmaskinen tillåter inte det just nu. Slå på fjärrstart på maskinen, stäng luckan och försök igen.",
  program_locked: "Programmet går inte att ändra just nu.",
  rate_limit: "AEG begränsar anropen. Försök igen strax.",
  failed: "AEG kunde inte utföra kommandot.",
};

export class AegControlError extends Error {
  constructor(public code: AegErrorCode) {
    super(MESSAGES[code]);
    this.name = "AegControlError";
  }
}

type AegDeps = { getToken: () => Promise<string>; getApiKey: () => Promise<string | null>; fetchFn?: typeof fetch };

/** Skickar ett kommando till maskinen. `denied` är felet när maskinen säger nej (403/406/409/412/422). */
async function send(applianceId: string, command: Record<string, unknown>, denied: AegErrorCode, deps: AegDeps): Promise<void> {
  const apiKey = await deps.getApiKey();
  if (!apiKey) throw new AegControlError("reauth");
  const token = await deps.getToken();
  const body = applianceId.startsWith("1:") ? { commands: [command] } : command;
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(`${AEG_API}/appliances/${encodeURIComponent(applianceId)}/command`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new AegControlError("failed");
  }
  if (res.ok) return;
  if (res.status === 401) throw new AegControlError("reauth");
  if ([403, 406, 409, 412, 422].includes(res.status)) throw new AegControlError(denied);
  if (res.status === 429) throw new AegControlError("rate_limit");
  throw new AegControlError("failed");
}

export async function controlAeg(action: AegAction, applianceId: string, deps: AegDeps): Promise<void> {
  await send(applianceId, { executeCommand: COMMANDS[action] }, "not_allowed", deps);
}

/** Byter program. Programmet ska redan vara kontrollerat mot maskinens egen lista (se control-flow). */
export async function setAegProgram(programUid: string, applianceId: string, deps: AegDeps): Promise<void> {
  await send(applianceId, { userSelections: { programUID: programUid } }, "program_locked", deps);
}
