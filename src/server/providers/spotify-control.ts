// OBS: sökvägar och felformat är skrivna från Spotifys Web API-dokumentation som den ser ut i minnet och är testade
// mot falska svar, inte mot riktiga Spotify. Styrning kräver Spotify Premium och scope user-modify-playback-state.
const API = "https://api.spotify.com/v1";

export type SpotifyAction = "play" | "pause" | "next" | "previous";
export const SPOTIFY_ACTIONS: readonly SpotifyAction[] = ["play", "pause", "next", "previous"];

export type ControlErrorCode = "reauth" | "scope" | "premium" | "no_device" | "device_offline" | "choose_device" | "restricted_device" | "not_now" | "volume_disallowed" | "rate_limit" | "failed";

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  /** Sätts av listSpotifyDevices: sant för enheten som spelar nu. */
  active?: boolean;
  /** Sätts av listSpotifyDevices: Spotify tillåter inte styrning av enheten via sitt API (eller saknar id). */
  restricted?: boolean;
}

const MESSAGES: Record<ControlErrorCode, string> = {
  reauth: "Anslut Spotify igen i Inställningar.",
  scope: "Anslut Spotify igen i Inställningar för att kunna styra uppspelning.",
  premium: "Spotify Premium krävs för att styra uppspelning.",
  no_device: "Spotify hittar ingen enhet. Öppna Spotify-appen på telefonen eller datorn och försök igen.",
  device_offline: "Enheten svarar inte. Öppna Spotify på den och försök igen.",
  choose_device: "Välj var musiken ska spelas.",
  restricted_device: "Enheten går inte att styra härifrån. Välj en annan enhet.",
  not_now: "Det går inte just nu.",
  volume_disallowed: "Spotify tillåter inte volymstyrning av den här enheten. Ändra volymen på enheten.",
  rate_limit: "Spotify begränsar anropen. Försök igen strax.",
  failed: "Spotify kunde inte utföra kommandot.",
};

/** Fel med en färdig, användarvänlig svensk text. Innehåller aldrig token eller tjänstens svarskropp. */
export class ControlError extends Error {
  /** `detail`: teknisk text (status och Spotifys orsak) som läggs efter den vanliga texten, bara för oväntade fel. */
  constructor(public code: ControlErrorCode, public devices?: SpotifyDevice[], detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = "ControlError";
  }
}

/** Kort, säker beskrivning av ett Spotify-fel: bara statuskod, orsaksord och en kort felrad. Aldrig token. */
function describeFailure(status: number, info: { reason?: string; message?: string }, secret: string): string {
  const clean = (t: string | undefined, max: number) => (t ?? "").split(secret).join("***").replace(/[^\p{L}\p{N} :.,_'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const reason = clean(info.reason, 40);
  const message = clean(info.message, 90);
  return [String(status), reason, message].filter(Boolean).join(", ");
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

async function toError(res: Response, secret: string): Promise<ControlError> {
  if (res.status === 401) return new ControlError("reauth");
  if (res.status === 429) return new ControlError("rate_limit");
  const info = await errorInfo(res);
  if (res.status === 404 && (info.reason === "NO_ACTIVE_DEVICE" || info.reason === undefined)) return new ControlError("no_device");
  if (res.status === 403) {
    if (info.reason === "PREMIUM_REQUIRED") return new ControlError("premium");
    // Spotify skickar ibland orsaken som kod, ibland bara som text (t.ex. "Restricted device").
    if (info.reason === "RESTRICTED_DEVICE" || /restricted device/i.test(info.message ?? "")) return new ControlError("restricted_device");
    if (info.reason === "VOLUME_CONTROL_DISALLOW" || /control device volume/i.test(info.message ?? "")) return new ControlError("volume_disallowed");
    if (/restriction violated/i.test(info.message ?? "")) return new ControlError("not_now");
    if (/scope/i.test(info.message ?? "")) return new ControlError("scope");
  }
  const detail = describeFailure(res.status, info, secret);
  // Loggas på servern (syns i Vercels loggar): bara status och orsak, aldrig token.
  console.error(`[spotify] oväntat svar: ${detail}`);
  return new ControlError("failed", undefined, detail);
}

type Caller = ((method: string, path: string, body?: unknown) => Promise<Response>) & { fail: (res: Response) => Promise<ControlError> };

async function caller(deps: ControlDeps): Promise<Caller> {
  const token = await deps.getToken();
  const fetchFn = deps.fetchFn ?? fetch;
  const call = async (method: string, path: string, body?: unknown) => {
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
  // Felbeskrivningen får aldrig innehålla token, så anropsfunktionen som äger token gör också felet.
  return Object.assign(call, { fail: (res: Response) => toError(res, token) });
}

/**
 * Enheter ur Spotifys svar. Utan `includeRestricted` (automatiska reservvägen vid "spela") utesluts begränsade enheter och enheter utan id.
 * Med `includeRestricted` (listan användaren ser) visas allt Spotify returnerar, och sådant som inte går att styra märks `restricted`.
 */
function parseDevices(json: unknown, includeRestricted = false): SpotifyDevice[] {
  const list = (json as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(list)) return [];
  const out: SpotifyDevice[] = [];
  for (const d of list as Record<string, unknown>[]) {
    if (!d || typeof d.name !== "string") continue;
    const id = typeof d.id === "string" ? d.id : "";
    const restricted = d.is_restricted === true || !id;
    if (restricted && !includeRestricted) continue;
    out.push({ id, name: d.name, type: typeof d.type === "string" ? d.type : "Okänd", active: d.is_active === true, restricted });
  }
  return out;
}

async function transferWith(call: Caller, id: string, play: boolean): Promise<void> {
  const res = await call("PUT", "/me/player", { device_ids: [id], play });
  if (res.ok) return;
  // Spotify svarar 404/5xx när enheten sover eller inte längre är nåbar (t.ex. en dator där Spotify stängts).
  if (res.status >= 500) throw new ControlError("device_offline");
  if (res.status === 404 && (await errorInfo(res.clone())).reason !== "NO_ACTIVE_DEVICE") throw new ControlError("device_offline");
  throw await call.fail(res);
}

/** Alla tillgängliga enheter. Fel visas (till skillnad från reservvägen i controlSpotify, som tyst ger en tom lista). */
export async function listSpotifyDevices(deps: ControlDeps): Promise<SpotifyDevice[]> {
  const call = await caller(deps);
  const res = await call("GET", "/me/player/devices");
  if (!res.ok) throw await call.fail(res);
  try {
    return parseDevices(await res.json(), true);
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
  const err = await call.fail(res);
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

/** Volym i procent (0–100) på den aktiva enheten. Kräver att Spotify tillåter volym för enheten (`supports_volume`). */
export async function setSpotifyVolume(volume: number, deps: ControlDeps): Promise<void> {
  const call = await caller(deps);
  const pct = Math.max(0, Math.min(100, Math.round(volume)));
  const res = await call("PUT", `/me/player/volume?volume_percent=${pct}`);
  if (!res.ok) throw await call.fail(res);
}
