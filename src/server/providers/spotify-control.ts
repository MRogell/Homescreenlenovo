// OBS: sökvägar och felformat är skrivna från Spotifys Web API-dokumentation som den ser ut i minnet och är testade
// mot falska svar, inte mot riktiga Spotify. Styrning kräver Spotify Premium och scope user-modify-playback-state.
const API = "https://api.spotify.com/v1";

export type SpotifyAction = "play" | "pause" | "next" | "previous";
export const SPOTIFY_ACTIONS: readonly SpotifyAction[] = ["play", "pause", "next", "previous"];

export type ControlErrorCode = "reauth" | "scope" | "premium" | "no_device" | "choose_device" | "rate_limit" | "failed";

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  /** Sätts av listSpotifyDevices: sant för enheten som spelar nu. */
  active?: boolean;
}

const MESSAGES: Record<ControlErrorCode, string> = {
  reauth: "Anslut Spotify igen i Inställningar.",
  scope: "Anslut Spotify igen i Inställningar för att kunna styra uppspelning.",
  premium: "Spotify Premium krävs för att styra uppspelning.",
  no_device: "Spotify hittar ingen enhet. Öppna Spotify-appen på telefonen eller datorn och försök igen.",
  choose_device: "Välj var musiken ska spelas.",
  rate_limit: "Spotify begränsar anropen. Försök igen strax.",
  failed: "Spotify kunde inte utföra kommandot.",
};

/** Fel med en färdig, användarvänlig svensk text. Innehåller aldrig token eller tjänstens svarskropp. */
export class ControlError extends Error {
  constructor(public code: ControlErrorCode, public devices?: SpotifyDevice[]) {
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

async function toError(res: Response): Promise<ControlError> {
  if (res.status === 401) return new ControlError("reauth");
  if (res.status === 429) return new ControlError("rate_limit");
  const info = await errorInfo(res);
  if (res.status === 404 && (info.reason === "NO_ACTIVE_DEVICE" || info.reason === undefined)) return new ControlError("no_device");
  if (res.status === 403) {
    if (info.reason === "PREMIUM_REQUIRED") return new ControlError("premium");
    if (/scope/i.test(info.message ?? "")) return new ControlError("scope");
  }
  return new ControlError("failed");
}

type Caller = (method: string, path: string, body?: unknown) => Promise<Response>;

async function caller(deps: ControlDeps): Promise<Caller> {
  const token = await deps.getToken();
  const fetchFn = deps.fetchFn ?? fetch;
  return async (method, path, body) => {
    try {
      return await fetchFn(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch {
      throw new ControlError("failed");
    }
  };
}

/** Enheter som går att spela på. Begränsade enheter (is_restricted) utesluts. */
function parseDevices(json: unknown): SpotifyDevice[] {
  const list = (json as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(list)) return [];
  return list
    .filter((d): d is { id: string; name: string; type?: unknown; is_restricted?: unknown; is_active?: unknown } => !!d && typeof d.id === "string" && !!d.id && typeof d.name === "string" && d.is_restricted !== true)
    .map((d) => ({ id: d.id, name: d.name, type: typeof d.type === "string" ? d.type : "Okänd", active: d.is_active === true }));
}

async function transferWith(call: Caller, id: string, play: boolean): Promise<void> {
  const res = await call("PUT", "/me/player", { device_ids: [id], play });
  if (!res.ok) throw await toError(res);
}

/** Alla tillgängliga enheter. Fel visas (till skillnad från reservvägen i controlSpotify, som tyst ger en tom lista). */
export async function listSpotifyDevices(deps: ControlDeps): Promise<SpotifyDevice[]> {
  const call = await caller(deps);
  const res = await call("GET", "/me/player/devices");
  if (!res.ok) throw await toError(res);
  try {
    return parseDevices(await res.json());
  } catch {
    return [];
  }
}

/** Flyttar uppspelningen till en annan enhet. `play` = fortsätt spela där (annars förblir den pausad). */
export async function transferSpotify(deviceId: string, play: boolean, deps: ControlDeps): Promise<void> {
  return transferWith(await caller(deps), deviceId, play);
}

export async function controlSpotify(action: SpotifyAction, deps: ControlDeps, deviceId?: string, preferred?: { id: string; name: string } | null): Promise<void> {
  const call = await caller(deps);

  async function availableDevices(): Promise<SpotifyDevice[]> {
    const res = await call("GET", "/me/player/devices");
    if (!res.ok) return [];
    try {
      return parseDevices(await res.json()).map(({ id, name, type }) => ({ id, name, type }));
    } catch {
      return [];
    }
  }

  // Flyttar uppspelningen till en enhet och startar den. Spotify fortsätter där den senast var.
  if (action === "play" && deviceId) return transferWith(call, deviceId, true);

  const { method, path } = REQUESTS[action];
  const res = await call(method, path);
  if (res.ok) return;
  const err = await toError(res);
  // Ingen aktiv enhet (t.ex. Spotify pausad i bakgrunden på telefonen): väck en tillgänglig enhet i stället.
  if (action === "play" && err.code === "no_device") {
    const devices = await availableDevices();
    // Standardenheten först: på id, annars på namn (Spotify kan ge en enhet nytt id).
    if (preferred) {
      const wanted = preferred.name.trim().toLowerCase();
      const match = devices.find((d) => d.id === preferred.id) ?? devices.find((d) => d.name.trim().toLowerCase() === wanted);
      if (match) return transferWith(call, match.id, true);
    }
    if (devices.length === 1) return transferWith(call, devices[0]!.id, true);
    if (devices.length > 1) throw new ControlError("choose_device", devices);
  }
  throw err;
}
