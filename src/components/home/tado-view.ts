import { formatTempShort } from "@/lib/format";
import type { TadoData } from "@/server/providers/schemas";

type Room = TadoData["rooms"][number];

/** Ringens skala: 15 °C är tom, 25 °C är full. */
export const SCALE_MIN = 15;
export const SCALE_MAX = 25;

export interface TadoRoomView {
  name: string;
  /** "21,4°", eller "–" när temperaturen är okänd. */
  temp: string;
  /** Hur mycket av ringen som fylls, 0 till 1. */
  arc: number;
  /** Målets läge på ringen i grader från toppen (medsols), eller null. */
  goal: number | null;
  tone: "heating" | "cold" | "ok" | "unknown";
  /** För skärmläsare. */
  label: string;
}

const frac = (c: number) => Math.min(1, Math.max(0, (c - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)));

/** Allt Inomhus-kortet visar per rum. Ren funktion: kortet ritar bara upp resultatet. */
export function tadoView(rooms: readonly Room[]): TadoRoomView[] {
  return rooms.map((r) => {
    const t = r.tempC, goal = r.targetC;
    const tone: TadoRoomView["tone"] = r.heating ? "heating" : t === null ? "unknown" : goal !== null && t < goal - 1 ? "cold" : "ok";
    const parts = t === null ? `${r.name}, temperatur okänd` : `${r.name} ${formatTempShort(t)} grader${goal !== null ? `, mål ${formatTempShort(goal)}` : r.heating ? ", värmer" : ""}`;
    return { name: r.name, temp: t === null ? "–" : `${formatTempShort(t)}°`, arc: t === null ? 0 : frac(t), goal: goal === null ? null : frac(goal) * 360, tone, label: parts };
  });
}

/** Punkt på ringen (viewBox 80, radie 30) för en vinkel i grader från toppen, medsols. */
export function goalPoint(deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: 40 + 30 * Math.sin(a), y: 40 - 30 * Math.cos(a) };
}
