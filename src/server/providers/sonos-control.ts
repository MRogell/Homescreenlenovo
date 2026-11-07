import { SONOS_API } from "./sonos";

export type SonosAction = "play" | "pause" | "next" | "previous";
export const SONOS_ACTIONS: readonly SonosAction[] = ["play", "pause", "next", "previous"];
export type SonosErrorCode = "reauth" | "gone" | "rate_limit" | "failed";

const MESSAGES: Record<SonosErrorCode, string> = {
  reauth: "Anslut Sonos igen i Inställningar.",
  gone: "Rummet finns inte längre (rum har kopplats ihop eller isär). Vänta på nästa uppdatering.",
  rate_limit: "Sonos begränsar anropen. Försök igen strax.",
  failed: "Sonos kunde inte utföra kommandot (finns det något att spela i rummet?).",
};

export class SonosControlError extends Error {
  constructor(public code: SonosErrorCode) {
    super(MESSAGES[code]);
    this.name = "SonosControlError";
  }
}

const PATHS: Record<SonosAction, string> = { play: "play", pause: "pause", next: "skipToNextTrack", previous: "skipToPreviousTrack" };

export async function controlSonos(action: SonosAction, groupId: string, deps: { getToken: () => Promise<string>; fetchFn?: typeof fetch }): Promise<void> {
  const token = await deps.getToken();
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(`${SONOS_API}/groups/${encodeURIComponent(groupId)}/playback/${PATHS[action]}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new SonosControlError("failed");
  }
  if (res.ok) return;
  if (res.status === 401) throw new SonosControlError("reauth");
  if (res.status === 404 || res.status === 410) throw new SonosControlError("gone");
  if (res.status === 429) throw new SonosControlError("rate_limit");
  throw new SonosControlError("failed");
}
