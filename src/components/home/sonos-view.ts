import type { SonosData } from "@/server/providers/schemas";
import { roomName } from "./spotify-view";

type Group = SonosData["groups"][number];

export interface SonosHero { id: string; name: string; extra: string | null; title: string; artist: string; imageUrl: string | null; volume: number | null }
export interface SonosChip { id: string; label: string; playing: boolean }

/** Namn och eventuella extra rum. Ett stereopar ("Vardagsrum - Höger" + "- Vänster") är ett rum, en riktig grupp nämner de andra rummen. */
function names(g: Group): { name: string; extra: string | null } {
  const name = roomName(g.room);
  const others = [...new Set(g.members.map(roomName))].filter((m) => m !== name);
  return { name, extra: others.length ? others.join(", ") : null };
}

/** Det första rummet som spelar visas stort. Alla andra rum blir val. Ordningen från Sonos (spelande först) behålls. */
export function sonosView(groups: readonly Group[]): { hero: SonosHero | null; chips: SonosChip[] } {
  const playing = groups.find((g) => g.playing);
  const hero = playing ? { id: playing.id, ...names(playing), title: playing.title || "Inget spelas", artist: playing.artist, imageUrl: playing.imageUrl, volume: playing.volume } : null;
  const chips = groups.filter((g) => g !== playing).map((g) => {
    const n = names(g);
    return { id: g.id, label: n.extra ? `${n.name} + ${n.extra}` : n.name, playing: g.playing };
  });
  return { hero, chips };
}
