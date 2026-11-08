import { spotifySchema, type SpotifyData } from "./schemas";
import type { Provider } from "./types";

// OBS: endpoint- och fältnamn är skrivna från Spotifys Web API-dokumentation som den ser ut i minnet och är
// testade mot falska svar, inte mot riktiga Spotify (se docs/superpowers/specs/2026-11-07-etapp-2-sonos-spotify-design.md).
const API = "https://api.spotify.com/v1";

export interface SpotifyDeps {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  isConnected?: () => Promise<boolean>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const names = (v: unknown): string => (Array.isArray(v) ? v.map((a) => str(obj(a)?.name)).filter(Boolean).join(", ") : "");

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Väljer en bild runt 300 px (Spotify listar störst först) och godtar bara Spotifys egen bildserver över https. */
export function pickImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const list = images.map(obj).filter((i): i is Json => !!i && typeof i.url === "string");
  const chosen = list.find((i) => typeof i.width === "number" && i.width <= 320) ?? list[list.length - 1];
  const url = str(chosen?.url);
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "i.scdn.co" ? u.toString() : null;
  } catch {
    return null;
  }
}

const NO_DEVICE = { deviceRestricted: false, supportsVolume: false, volume: null } as const;
const NO_MEDIA = { imageUrl: null, progressMs: null, durationMs: null } as const;
const NOTHING: SpotifyData = { playing: false, title: "Inget spelas", artist: "", device: null, lastPlayedAt: null, ...NO_DEVICE, ...NO_MEDIA };

export function createSpotifyProvider(deps: SpotifyDeps): Provider<SpotifyData> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.nowMs ?? Date.now;

  async function get(path: string, token: string): Promise<{ status: number; json: Json | undefined }> {
    const res = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 401) throw new Error("Spotify nekade åtkomst: anslut igen");
    if (res.status === 429) throw new Error(`Spotify begränsar anropen, försök igen om ${res.headers.get("Retry-After") ?? "några"} s`);
    if (res.status === 204) return { status: 204, json: undefined };
    if (!res.ok) throw new Error(`Spotify svarade ${res.status}`);
    try {
      return { status: res.status, json: obj(await res.json()) };
    } catch {
      throw new Error("Ogiltigt svar från Spotify");
    }
  }

  async function lastPlayed(token: string): Promise<SpotifyData> {
    const { json } = await get("/me/player/recently-played?limit=1", token);
    const first = Array.isArray(json?.items) ? obj(json.items[0]) : undefined;
    const track = obj(first?.track);
    const title = str(track?.name);
    if (!title) return NOTHING;
    return { playing: false, title, artist: names(track?.artists), device: null, lastPlayedAt: str(first?.played_at) ?? null, ...NO_DEVICE, ...NO_MEDIA, imageUrl: pickImage(obj(track?.album)?.images) };
  }

  return {
    id: "spotify",
    ttlSeconds: 30,
    schema: spotifySchema,
    isConnected: deps.isConnected,
    async getSummary() {
      const token = await deps.getToken();
      const { json } = await get("/me/player", token);
      if (!json) return lastPlayed(token);
      const playing = json.is_playing === true;
      const dev = obj(json.device);
      const device = str(dev?.name) ?? null;
      // Vad Spotify tillåter för den aktiva enheten: kommandon (is_restricted) och volym (supports_volume).
      const deviceRestricted = dev?.is_restricted === true;
      const volumePct = typeof dev?.volume_percent === "number" ? dev.volume_percent : null;
      const supportsVolume = !deviceRestricted && dev?.supports_volume === true && volumePct !== null;
      const caps = { deviceRestricted, supportsVolume, volume: supportsVolume ? volumePct : null };
      if (json.currently_playing_type === "ad") return { playing, title: "Reklam", artist: "", device, lastPlayedAt: playing ? new Date(now()).toISOString() : null, ...caps, ...NO_MEDIA };
      const item = obj(json.item);
      const title = str(item?.name);
      if (!title) return lastPlayed(token);
      return {
        playing,
        title,
        artist: names(item?.artists) || str(obj(item?.show)?.name) || "",
        device,
        lastPlayedAt: playing ? new Date(now()).toISOString() : null,
        ...caps,
        imageUrl: pickImage(obj(item?.album)?.images) ?? pickImage(item?.images) ?? pickImage(obj(item?.show)?.images),
        progressMs: num(json.progress_ms),
        durationMs: num(item?.duration_ms),
      };
    },
  };
}
