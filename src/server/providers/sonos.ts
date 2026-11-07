import { sonosSchema, type SonosData } from "./schemas";
import type { Provider } from "./types";

// OBS: sökvägar och fältnamn är skrivna från Sonos Control API-dokumentationen som den ser ut i minnet och är
// testade mot falska svar, inte mot riktiga Sonos (se docs/superpowers/specs/2026-11-07-etapp-2-sonos-spotify-design.md).
const API = "https://api.ws.sonos.com/control/api/v1";

export interface SonosDeps {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
  isConnected?: () => Promise<boolean>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const PLAYING = new Set(["PLAYBACK_STATE_PLAYING", "PLAYBACK_STATE_BUFFERING"]);

export function createSonosProvider(deps: SonosDeps): Provider<SonosData> {
  const fetchFn = deps.fetchFn ?? fetch;

  async function get(path: string, token: string): Promise<Json> {
    const res = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 401) throw new Error("Sonos nekade åtkomst: anslut igen");
    if (res.status === 429) throw new Error("Sonos begränsar anropen, försök igen strax");
    if (!res.ok) throw new Error(`Sonos svarade ${res.status}`);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new Error("Ogiltigt svar från Sonos");
    }
    const o = obj(json);
    if (!o) throw new Error("Ogiltigt svar från Sonos");
    return o;
  }

  return {
    id: "sonos",
    ttlSeconds: 15,
    schema: sonosSchema,
    isConnected: deps.isConnected,
    async getSummary() {
      const token = await deps.getToken();
      const household = str(obj(arr((await get("/households", token)).households)[0])?.id);
      if (!household) throw new Error("Hittar inget Sonos-hushåll");

      const data = await get(`/households/${encodeURIComponent(household)}/groups`, token);
      const groups = arr(data.groups).map(obj).filter((g): g is Json => !!g && !!str(g.id));
      if (groups.length === 0) throw new Error("Hittar inga Sonos-grupper");
      const players = new Map(arr(data.players).map(obj).filter((p): p is Json => !!p).map((p) => [String(p.id), str(p.name) ?? "Okänt rum"]));

      // Uppspelningsläge: från gruppen om det finns, annars en fråga per grupp.
      const playbacks = new Map<string, Json>();
      const states = await Promise.all(
        groups.map(async (g) => {
          const id = String(g.id);
          const own = str(g.playbackState);
          if (own) return own;
          const pb = await get(`/groups/${encodeURIComponent(id)}/playback`, token);
          playbacks.set(id, pb);
          return str(pb.playbackState) ?? "";
        }),
      );
      const idx = Math.max(0, states.findIndex((s) => PLAYING.has(s)));
      const group = groups[idx]!;
      const gid = encodeURIComponent(String(group.id));

      const [playback, metadata, volume] = await Promise.all([
        playbacks.get(String(group.id)) ?? get(`/groups/${gid}/playback`, token),
        get(`/groups/${gid}/playbackMetadata`, token),
        get(`/groups/${gid}/groupVolume`, token),
      ]);

      const track = obj(obj(metadata.currentItem)?.track);
      const title = str(track?.name) ?? str(obj(metadata.container)?.name) ?? "Inget spelas";
      const duration = typeof track?.durationMillis === "number" ? track.durationMillis : 0;
      const position = typeof playback.positionMillis === "number" ? playback.positionMillis : 0;
      const coordinator = String(group.coordinatorId ?? "");
      const room = players.get(coordinator) ?? str(group.name) ?? "Sonos";

      return {
        playing: PLAYING.has(str(playback.playbackState) ?? states[idx] ?? ""),
        title,
        artist: str(obj(track?.artist)?.name) ?? "",
        room,
        grouped: arr(group.playerIds).map(String).filter((id) => id !== coordinator).map((id) => players.get(id) ?? "Okänt rum"),
        volume: typeof volume.volume === "number" ? volume.volume : 0,
        progressPct: duration > 0 ? Math.max(0, Math.min(100, Math.round((position / duration) * 100))) : 0,
      };
    },
  };
}
