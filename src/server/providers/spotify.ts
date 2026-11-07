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

const NOTHING: SpotifyData = { playing: false, title: "Inget spelas", artist: "", device: null, lastPlayedAt: null };

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
    return { playing: false, title, artist: names(track?.artists), device: null, lastPlayedAt: str(first?.played_at) ?? null };
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
      const device = str(obj(json.device)?.name) ?? null;
      if (json.currently_playing_type === "ad") return { playing, title: "Reklam", artist: "", device, lastPlayedAt: playing ? new Date(now()).toISOString() : null };
      const item = obj(json.item);
      const title = str(item?.name);
      if (!title) return lastPlayed(token);
      return {
        playing,
        title,
        artist: names(item?.artists) || str(obj(item?.show)?.name) || "",
        device,
        lastPlayedAt: playing ? new Date(now()).toISOString() : null,
      };
    },
  };
}
