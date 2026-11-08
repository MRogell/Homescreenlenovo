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

type SonosDeps = { getToken: () => Promise<string>; fetchFn?: typeof fetch };

async function call(path: string, deps: SonosDeps, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const token = await deps.getToken();
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(`${SONOS_API}${path}`, {
      method: init.method ?? "POST",
      headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
  } catch {
    throw new SonosControlError("failed");
  }
  if (res.ok) return res;
  if (res.status === 401) throw new SonosControlError("reauth");
  if (res.status === 404 || res.status === 410) throw new SonosControlError("gone");
  if (res.status === 429) throw new SonosControlError("rate_limit");
  throw new SonosControlError("failed");
}

export async function controlSonos(action: SonosAction, groupId: string, deps: SonosDeps): Promise<void> {
  await call(`/groups/${encodeURIComponent(groupId)}/playback/${PATHS[action]}`, deps);
}

/** Gruppens volym 0–100. */
export async function setSonosVolume(groupId: string, volume: number, deps: SonosDeps): Promise<void> {
  await call(`/groups/${encodeURIComponent(groupId)}/groupVolume`, deps, { body: { volume } });
}

/** Flyttar musiken från en grupp till en högtalare: ny grupp med högtalaren som tar över den gamla gruppens uppspelning. */
export async function moveSonos(fromGroupId: string, toPlayerId: string, deps: SonosDeps): Promise<void> {
  const res = await call("/households", deps, { method: "GET" });
  const json = (await res.json().catch(() => null)) as { households?: { id?: unknown }[] } | null;
  const household = json?.households?.[0]?.id;
  if (typeof household !== "string" || !household) throw new SonosControlError("failed");
  await call(`/households/${encodeURIComponent(household)}/groups/createGroup`, deps, { body: { playerIds: [toPlayerId], musicContextGroupId: fromGroupId } });
}
