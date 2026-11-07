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

export async function controlSpotify(action: SpotifyAction, deps: ControlDeps, deviceId?: string): Promise<void> {
  const token = await deps.getToken();
  const fetchFn = deps.fetchFn ?? fetch;

  async function call(method: string, path: string, body?: unknown): Promise<Response> {
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
  }

  // Flyttar uppspelningen till en enhet och startar den. Spotify fortsätter där den senast var.
  async function transfer(id: string): Promise<void> {
    const res = await call("PUT", "/me/player", { device_ids: [id], play: true });
    if (!res.ok) throw await toError(res);
  }

  async function availableDevices(): Promise<SpotifyDevice[]> {
    const res = await call("GET", "/me/player/devices");
    if (!res.ok) return [];
    try {
      const list = ((await res.json()) as { devices?: unknown }).devices;
      if (!Array.isArray(list)) return [];
      return list
        .filter((d): d is { id: string; name: string; type?: unknown; is_restricted?: unknown } => !!d && typeof d.id === "string" && !!d.id && typeof d.name === "string" && d.is_restricted !== true)
        .map((d) => ({ id: d.id, name: d.name, type: typeof d.type === "string" ? d.type : "Okänd" }));
    } catch {
      return [];
    }
  }

  if (action === "play" && deviceId) return transfer(deviceId);

  const { method, path } = REQUESTS[action];
  const res = await call(method, path);
  if (res.ok) return;
  const err = await toError(res);
  // Ingen aktiv enhet (t.ex. Spotify pausad i bakgrunden på telefonen): väck en tillgänglig enhet i stället.
  if (action === "play" && err.code === "no_device") {
    const devices = await availableDevices();
    if (devices.length === 1) return transfer(devices[0]!.id);
    if (devices.length > 1) throw new ControlError("choose_device", devices);
  }
  throw err;
}
