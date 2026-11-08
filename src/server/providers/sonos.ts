import { sonosSchema, type SonosData } from "./schemas";
import type { Provider } from "./types";

// OBS: sökvägar och fältnamn är skrivna från Sonos Control API-dokumentationen som den ser ut i minnet och är
// testade mot falska svar, inte mot riktiga Sonos (se docs/superpowers/specs/2026-11-08-sonos-rum-design.md).
export const SONOS_API = "https://api.ws.sonos.com/control/api/v1";

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
    const res = await fetchFn(`${SONOS_API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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
  // Delar som får fallera utan att rummet försvinner ur listan (metadata, volym).
  const optional = (path: string, token: string) => get(path, token).catch(() => undefined);

  return {
    id: "sonos",
    ttlSeconds: 30,
    schema: sonosSchema,
    isConnected: deps.isConnected,
    async getSummary() {
      const token = await deps.getToken();
      const household = str(obj(arr((await get("/households", token)).households)[0])?.id);
      if (!household) throw new Error("Hittar inget Sonos-hushåll");

      const data = await get(`/households/${encodeURIComponent(household)}/groups`, token);
      const players = new Map(arr(data.players).map(obj).filter((p): p is Json => !!p).map((p) => [String(p.id), str(p.name) ?? "Okänt rum"]));
      const groups = arr(data.groups).map(obj).filter((g): g is Json => !!g && !!str(g.id));

      const rooms = await Promise.all(
        groups.map(async (g) => {
          const gid = encodeURIComponent(String(g.id));
          const [state, metadata, volume] = await Promise.all([
            str(g.playbackState) ?? optional(`/groups/${gid}/playback`, token).then((pb) => str(pb?.playbackState) ?? ""),
            optional(`/groups/${gid}/playbackMetadata`, token),
            optional(`/groups/${gid}/groupVolume`, token),
          ]);
          const track = obj(obj(metadata?.currentItem)?.track);
          const coordinator = String(g.coordinatorId ?? "");
          return {
            id: String(g.id),
            room: players.get(coordinator) ?? str(g.name) ?? "Sonos",
            members: arr(g.playerIds).map(String).filter((id) => id !== coordinator).map((id) => players.get(id) ?? "Okänt rum"),
            playing: PLAYING.has(state),
            title: str(track?.name) ?? str(obj(metadata?.container)?.name) ?? "Inget spelas",
            artist: str(obj(track?.artist)?.name) ?? "",
            volume: typeof volume?.volume === "number" ? volume.volume : null,
          };
        }),
      );
      // Spelande rum först, sedan i bokstavsordning.
      rooms.sort((a, b) => Number(b.playing) - Number(a.playing) || a.room.localeCompare(b.room, "sv"));
      const groupOf = new Map<string, string>();
      for (const g of groups) for (const pid of arr(g.playerIds)) groupOf.set(String(pid), String(g.id));
      const allPlayers = [...players].map(([id, name]) => ({ id, name, groupId: groupOf.get(id) ?? null }));
      return { groups: rooms, players: allPlayers };
    },
  };
}
