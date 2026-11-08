/** "3:28", eller "1:02:05" för långa poddavsnitt. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Förloppet räknas fram mellan hämtningarna så att stapeln rör sig jämnt. Stannar vid låtens slut och när den är pausad. */
export function estimateProgress(p: { progressMs: number | null; durationMs: number | null; playing: boolean; elapsedMs: number }): number | null {
  if (p.progressMs === null || p.durationMs === null) return null;
  const ms = p.progressMs + (p.playing ? Math.max(0, p.elapsedMs) : 0);
  return Math.min(p.durationMs, ms);
}

/** Medelfärg av omslagets färgade pixlar (RGBA). Nästan svart, nästan vitt och genomskinligt räknas inte. */
export function tintFromPixels(px: Uint8ClampedArray): string | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const [pr, pg, pb, pa] = [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!];
    const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
    if (pa < 128 || max < 30 || min > 225) continue;
    r += pr; g += pg; b += pb; n++;
  }
  return n ? `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` : null;
}

export type SonosInfo = {
  groups: { id: string; room: string; members: string[]; volume: number | null }[];
  players: { id: string; name: string; groupId: string | null }[];
};
export type SpotifyDeviceInfo = { id: string; name: string; type: string; active?: boolean; restricted?: boolean };
export type DeviceItem = {
  key: string;
  name: string;
  kind: "spotify" | "sonos";
  type: string;
  active: boolean;
  /** Kan väljas: Spotify-enhet, Sonos-rum när musiken redan är i Sonos (flytt), eller Sonos-rum som Spotify ser utan begränsning. */
  available: boolean;
  spotifyId?: string;
  playerId?: string;
  /** Rummets Sonos-grupp: startas via Sonos när Spotify inte ser rummet. */
  sonosGroupId?: string;
};

const norm = (s: string) => s.trim().toLocaleLowerCase("sv");
/** "Vardagsrum - Höger" → "Vardagsrum" (stereopar visas som ett rum). */
export const roomName = (s: string) => s.replace(/\s+-\s+(höger|vänster|left|right|l|r)$/i, "").trim();

/** Sonos-gruppen som Spotify spelar i, utifrån enhetens namn (rum, medlem eller högtalare). */
export function findSonosGroup(device: string | null, sonos: SonosInfo | null): { id: string; volume: number | null } | null {
  if (!device || !sonos) return null;
  const d = norm(device);
  const g = sonos.groups.find((x) => norm(x.room) === d || norm(roomName(x.room)) === d || x.members.some((m) => norm(m) === d));
  if (g) return { id: g.id, volume: g.volume };
  const p = sonos.players.find((x) => norm(x.name) === d || norm(roomName(x.name)) === d);
  const pg = p?.groupId ? sonos.groups.find((x) => x.id === p.groupId) : undefined;
  return pg ? { id: pg.id, volume: pg.volume } : null;
}

/** En lista: Spotifys egna enheter först, sedan varje Sonos-rum en gång. Spotify-enheter med samma namn som ett rum slås ihop med rummet. */
export function buildDeviceList(spotify: SpotifyDeviceInfo[], sonos: SonosInfo | null, currentSonosGroupId: string | null): DeviceItem[] {
  const rooms: DeviceItem[] = [];
  const roomKeys = new Set<string>();
  for (const p of sonos?.players ?? []) {
    const name = roomName(p.name);
    const k = norm(name);
    if (roomKeys.has(k)) {
      const r = rooms.find((x) => norm(x.name) === k)!;
      if (currentSonosGroupId && p.groupId === currentSonosGroupId) r.active = true;
      continue;
    }
    roomKeys.add(k);
    rooms.push({ key: `sonos:${p.id}`, name, kind: "sonos", type: "Sonos", active: !!currentSonosGroupId && p.groupId === currentSonosGroupId, available: !!currentSonosGroupId || !!p.groupId, playerId: p.id, ...(p.groupId ? { sonosGroupId: p.groupId } : {}) });
  }
  const own: DeviceItem[] = [];
  for (const d of spotify) {
    const room = rooms.find((r) => norm(r.name) === norm(d.name) || norm(r.name) === norm(roomName(d.name)));
    if (room) {
      // Spotify kan flytta musiken hit direkt: då används Spotify i stället för att starta rummets egen kö.
      if (!d.restricted && !currentSonosGroupId) { room.available = true; room.spotifyId = d.id; delete room.sonosGroupId; }
      if (d.active && !currentSonosGroupId) room.active = true;
      continue;
    }
    own.push({ key: `spotify:${d.id}`, name: d.name, kind: "spotify", type: d.type, active: !!d.active && !currentSonosGroupId, available: !d.restricted, spotifyId: d.id });
  }
  return [...own, ...rooms];
}
