import { AEG_API } from "@/lib/aeg-auth";

// Kommandon enligt officiella SDK:t (electrolux-group-developer-sdk 0.7.0): PUT /appliances/{id}/command med
// {"executeCommand": "START" | "PAUSE" | "RESUME" | "STOPRESET"}; DAM-apparater (id börjar med "1:") kräver {"commands": [...]}.
export type AegAction = "start" | "pause" | "resume" | "stop";
export const AEG_ACTIONS: readonly AegAction[] = ["start", "pause", "resume", "stop"];
export type AegErrorCode = "reauth" | "not_allowed" | "rate_limit" | "failed";

const COMMANDS: Record<AegAction, string> = { start: "START", pause: "PAUSE", resume: "RESUME", stop: "STOPRESET" };
const MESSAGES: Record<AegErrorCode, string> = {
  reauth: "Anslut AEG igen i Inställningar.",
  not_allowed: "Diskmaskinen tillåter inte det just nu. Slå på fjärrstart på maskinen, stäng luckan och försök igen.",
  rate_limit: "AEG begränsar anropen. Försök igen strax.",
  failed: "AEG kunde inte utföra kommandot.",
};

export class AegControlError extends Error {
  constructor(public code: AegErrorCode) {
    super(MESSAGES[code]);
    this.name = "AegControlError";
  }
}

export async function controlAeg(
  action: AegAction,
  applianceId: string,
  deps: { getToken: () => Promise<string>; getApiKey: () => Promise<string | null>; fetchFn?: typeof fetch },
): Promise<void> {
  const apiKey = await deps.getApiKey();
  if (!apiKey) throw new AegControlError("reauth");
  const token = await deps.getToken();
  const command = { executeCommand: COMMANDS[action] };
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
  if ([403, 406, 409, 412, 422].includes(res.status)) throw new AegControlError("not_allowed");
  if (res.status === 429) throw new AegControlError("rate_limit");
  throw new AegControlError("failed");
}
