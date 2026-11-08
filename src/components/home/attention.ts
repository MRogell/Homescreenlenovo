import { skodaSchema } from "@/server/providers/schemas";
import type { CardState } from "@/server/providers/types";

const SERVICES: [string, string][] = [["weather", "Väder"], ["calendar", "Kalender"], ["skoda", "Škoda"], ["spotify", "Spotify"], ["sonos", "Sonos"], ["aeg", "AEG"], ["tado", "Inomhus"]];
const LOW_BATTERY_PCT = 20;
const MAX_SHOWN = 2;

const joinSv = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} och ${names.at(-1)}`);

/** Bilens problem, viktigaste först. Okänt läge räknas aldrig som ett problem. */
function carProblems(state: CardState<unknown> | undefined): string[] {
  if (state?.status !== "ok" && state?.status !== "stale") return [];
  const parsed = skodaSchema.safeParse(state.data);
  if (!parsed.success) return [];
  const d = parsed.data;
  const out: string[] = [];
  if (d.doorsOpen) out.push("Bilens dörr är öppen");
  if (d.trunkOpen) out.push("Bilens bagagelucka är öppen");
  if (d.windowsOpen) out.push("Bilens fönster är öppna");
  if (d.bonnetOpen) out.push("Bilens motorhuv är öppen");
  // Olåst nämns inte separat när något står öppet: det säger redan mer.
  if (d.locked === false && out.length === 0) out.push("Bilen står olåst");
  if (d.levelKind === "battery" && d.levelPct !== null && d.levelPct <= LOW_BATTERY_PCT && !d.charging) out.push(`Bilens batteri är lågt (${d.levelPct} %)`);
  return out;
}

/**
 * Raden under hälsningen: bara det som kräver uppmärksamhet (bilen olåst eller öppen, lågt batteri, tjänster som inte svarar).
 * Tomt (null) när allt är som det ska. Högst två saker visas, resten som "+N".
 */
export function attentionLine(states: Record<string, CardState<unknown> | undefined>): string | null {
  const items = carProblems(states.skoda);
  const failing = SERVICES.filter(([id]) => states[id]?.status === "unavailable" || states[id]?.status === "stale").map(([, name]) => name);
  if (failing.length) items.push(`${joinSv(failing)} svarar inte just nu`);
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_SHOWN).join(" · ");
  return items.length > MAX_SHOWN ? `${shown} · +${items.length - MAX_SHOWN}` : shown;
}
