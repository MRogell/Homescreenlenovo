import { skodaSchema, weatherSchema } from "@/server/providers/schemas";
import type { Warning } from "@/server/providers/smhi";
import type { CardState } from "@/server/providers/types";

const SERVICES: [string, string][] = [["weather", "Väder"], ["calendar", "Kalender"], ["lists", "Inköp"], ["skoda", "Škoda"], ["spotify", "Spotify"], ["sonos", "Sonos"], ["aeg", "AEG"], ["tado", "Inomhus"]];
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

const TZ = "Europe/Stockholm";
const clock = (d: Date) => d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const day = (d: Date) => d.toLocaleDateString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
/** "14:00" samma dag, annars "tis 14:00". */
const when = (d: Date, now: Date) => (day(d) === day(now) ? clock(d) : `${d.toLocaleDateString("sv-SE", { weekday: "short", timeZone: TZ }).replace(".", "")} ${clock(d)}`);

/** SMHI:s varningar som gäller just nu (utgångna sorteras bort här, med klientens klocka). Allvarligast först. */
function activeWarnings(state: CardState<unknown> | undefined, now: Date): Warning[] {
  if (state?.status !== "ok" && state?.status !== "stale") return [];
  const parsed = weatherSchema.safeParse(state.data);
  const list = parsed.success ? parsed.data.warnings : null;
  return (list ?? []).filter((w) => !w.end || new Date(w.end).getTime() > now.getTime());
}

/** SMHI:s egna ord oförändrade (rubrik och nivå), källan angiven och tiden med, enligt deras villkor. */
function warningText(w: Warning, now: Date): string {
  const start = w.start ? new Date(w.start) : null, end = w.end ? new Date(w.end) : null;
  const time = start && start.getTime() > now.getTime() ? `, från ${when(start, now)}` : end ? `, till ${when(end, now)}` : "";
  return `${w.levelText} varning (SMHI): ${w.title}${time}`;
}

/** Färgen på raden: den allvarligaste varningen som visas. Null när inga varningar gäller. */
export function attentionTone(states: Record<string, CardState<unknown> | undefined>, now: Date = new Date()): Warning["level"] | null {
  return activeWarnings(states.weather, now)[0]?.level ?? null;
}

/**
 * Raden under hälsningen: bara det som kräver uppmärksamhet (bilen olåst eller öppen, lågt batteri, tjänster som inte svarar).
 * Tomt (null) när allt är som det ska. Högst två saker visas, resten som "+N".
 */
export function attentionLine(states: Record<string, CardState<unknown> | undefined>, now: Date = new Date()): string | null {
  // Vädervarningar först, sedan bilen.
  const items = [...activeWarnings(states.weather, now).map((w) => warningText(w, now)), ...carProblems(states.skoda)];
  const failing = SERVICES.filter(([id]) => states[id]?.status === "unavailable" || states[id]?.status === "stale").map(([, name]) => name);
  if (failing.length) items.push(`${joinSv(failing)} svarar inte just nu`);
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_SHOWN).join(" · ");
  return items.length > MAX_SHOWN ? `${shown} · +${items.length - MAX_SHOWN}` : shown;
}
