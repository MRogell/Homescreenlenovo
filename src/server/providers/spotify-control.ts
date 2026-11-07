// OBS: sökvägar och felformat är skrivna från Spotifys Web API-dokumentation som den ser ut i minnet och är testade
// mot falska svar, inte mot riktiga Spotify. Styrning kräver Spotify Premium och scope user-modify-playback-state.
const API = "https://api.spotify.com/v1";

export type SpotifyAction = "play" | "pause" | "next" | "previous";
export const SPOTIFY_ACTIONS: readonly SpotifyAction[] = ["play", "pause", "next", "previous"];

export type ControlErrorCode = "reauth" | "scope" | "premium" | "no_device" | "rate_limit" | "failed";

const MESSAGES: Record<ControlErrorCode, string> = {
  reauth: "Anslut Spotify igen i Inställningar.",
  scope: "Anslut Spotify igen i Inställningar för att kunna styra uppspelning.",
  premium: "Spotify Premium krävs för att styra uppspelning.",
  no_device: "Öppna Spotify på någon enhet först.",
  rate_limit: "Spotify begränsar anropen. Försök igen strax.",
  failed: "Spotify kunde inte utföra kommandot.",
};

/** Fel med en färdig, användarvänlig svensk text. Innehåller aldrig token eller tjänstens svarskropp. */
export class ControlError extends Error {
  constructor(public code: ControlErrorCode) {
    super(MESSAGES[code]);
    this.name = "ControlError";
  }
}

const REQUESTS: Record<SpotifyAction, { method: "PUT" | "POST"; path: string }> = {
  play: { method: "PUT", path: "/me/player/play" },
  pause: { method: "PUT", path: "/me/player/pause" },
  next: { method: "POST", path: "/me/player/next" },
  previous: { method: "POST", path: "/me/player/previous" },
};

export interface ControlDeps {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

async function errorInfo(res: Response): Promise<{ reason?: string; message?: string }> {
  try {
    const e = ((await res.json()) as { error?: { reason?: unknown; message?: unknown } }).error;
    return { reason: typeof e?.reason === "string" ? e.reason : undefined, message: typeof e?.message === "string" ? e.message : undefined };
  } catch {
    return {};
  }
}

export async function controlSpotify(action: SpotifyAction, deps: ControlDeps): Promise<void> {
  const token = await deps.getToken();
  const { method, path } = REQUESTS[action];
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    throw new ControlError("failed");
  }
  if (res.ok) return;
  if (res.status === 401) throw new ControlError("reauth");
  if (res.status === 429) throw new ControlError("rate_limit");
  const info = await errorInfo(res);
  if (res.status === 404 && (info.reason === "NO_ACTIVE_DEVICE" || info.reason === undefined)) throw new ControlError("no_device");
  if (res.status === 403) {
    if (info.reason === "PREMIUM_REQUIRED") throw new ControlError("premium");
    if (/scope/i.test(info.message ?? "")) throw new ControlError("scope");
  }
  throw new ControlError("failed");
}
