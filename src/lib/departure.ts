import { localClock } from "@/server/calendar/time";

/**
 * Förvärm till avresa. Plattan (eller någon öppen skärm) hämtar hemskärmens data var 30:e sekund, och då avgör servern om det är dags.
 * Reglerna ligger här som rena funktioner så att de går att testa utan klocka, bil eller nät.
 */
export const LEAD_OPTIONS = [10, 15, 20, 30] as const;
/** Hur länge efter avresetiden det fortfarande är värt att starta (bilen hinner värmas lite). */
export const GRACE_MIN = 5;
export const MAX_ATTEMPTS = 3;
/** En start som påbörjats men aldrig avslutats räknas som misslyckad efter så här lång tid. */
export const STARTING_STALE_MS = 2 * 60_000;

export type RunStatus = "starting" | "started" | "failed" | "skipped_warm" | "skipped_on";
export interface LastRun { date: string; status: RunStatus; attempts: number; at: number; tempC: number | null }

export interface DepartureSettings {
  enabled: boolean;
  /** Avresetid per veckodag ("HH:MM", svensk tid). 1 = måndag … 7 = söndag. Saknas dagen sker ingen förvärmning den dagen. */
  times: Record<string, string>;
  leadMin: number;
  /** Startar bara när utetemperaturen är högst så här många grader. */
  belowC: number;
  targetC: number;
  /** Datum (svensk tid) då användaren valt att hoppa över. */
  skipDate: string | null;
  last: LastRun | null;
}

export const DEFAULT_DEPARTURE: DepartureSettings = { enabled: false, times: { "1": "07:30", "2": "07:30", "3": "07:30", "4": "07:30", "5": "07:30" }, leadMin: 15, belowC: 5, targetC: 21, skipDate: null, last: null };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const RUN: RunStatus[] = ["starting", "started", "failed", "skipped_warm", "skipped_on"];

/** Tolerant tolkning av det som ligger i databasen: trasigt blir grundvärdet. */
export function normalizeDeparture(raw: unknown): DepartureSettings {
  const r = isRec(raw) ? raw : {};
  const num = (v: unknown, min: number, max: number, fb: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fb);
  const times: Record<string, string> = {};
  if (isRec(r.times)) {
    for (const [k, v] of Object.entries(r.times)) if (/^[1-7]$/.test(k) && typeof v === "string" && TIME.test(v)) times[k] = v;
  } else if (Array.isArray(r.days) && typeof r.time === "string" && TIME.test(r.time)) {
    // Äldre format: en tid för flera dagar.
    for (const d of r.days) if (Number.isInteger(d) && d >= 1 && d <= 7) times[String(d)] = r.time;
  }
  const lead = typeof r.leadMin === "number" && (LEAD_OPTIONS as readonly number[]).includes(r.leadMin) ? r.leadMin : DEFAULT_DEPARTURE.leadMin;
  const target = Math.round(num(r.targetC, 16, 29.5, 21) * 2) / 2;
  const l = isRec(r.last) ? r.last : null;
  const last: LastRun | null = l && typeof l.date === "string" && RUN.includes(l.status as RunStatus) ? { date: l.date, status: l.status as RunStatus, attempts: Math.max(0, Math.floor(num(l.attempts, 0, 99, 1))), at: typeof l.at === "number" ? l.at : 0, tempC: typeof l.tempC === "number" ? l.tempC : null } : null;
  return {
    enabled: r.enabled === true,
    times: Object.keys(times).length > 0 || isRec(r.times) ? times : { ...DEFAULT_DEPARTURE.times },
    leadMin: lead,
    belowC: Math.round(num(r.belowC, -20, 25, 5)),
    targetC: target,
    skipDate: typeof r.skipDate === "string" ? r.skipDate : null,
    last,
  };
}

export type Decision =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "wait"; startsAt: string }
  | { kind: "start" }
  | { kind: "skip"; reason: "warm" | "on" }
  | { kind: "done"; run: LastRun }
  | { kind: "skipped_user" }
  | { kind: "missed" };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Vad som ska hända just nu. `tempC` är utetemperaturen (null om okänd, och då startar vi hellre än inte).
 * `climateOn` är bilens läge (true = klimatiseringen går redan).
 */
export function decide(s: DepartureSettings, now: Date, ctx: { tempC: number | null; climateOn: boolean | null }): Decision {
  if (!s.enabled) return { kind: "off" };
  const c = localClock(now);
  const time = s.times[String(c.weekday)];
  if (!time) return { kind: "idle" };
  const depart = minutesOf(time);
  const start = Math.max(0, depart - s.leadMin);
  if (s.skipDate === c.date) return { kind: "skipped_user" };
  const run = s.last && s.last.date === c.date ? s.last : null;
  if (run) {
    if (run.status === "started" || run.status === "skipped_warm" || run.status === "skipped_on") return { kind: "done", run };
    const stale = run.status === "starting" && now.getTime() - run.at < STARTING_STALE_MS;
    if (stale) return { kind: "done", run };
    if (run.attempts >= MAX_ATTEMPTS) return { kind: "done", run: { ...run, status: "failed" } };
  }
  if (c.minutes < start) return { kind: "wait", startsAt: hhmm(start) };
  if (c.minutes > depart + GRACE_MIN) return { kind: "missed" };
  if (ctx.tempC !== null && ctx.tempC > s.belowC) return { kind: "skip", reason: "warm" };
  if (ctx.climateOn === true) return { kind: "skip", reason: "on" };
  return { kind: "start" };
}

export interface DepartureView {
  settings: Omit<DepartureSettings, "last" | "skipDate"> & { skippedToday: boolean };
  /** Kort rad under klimatrutan. */
  line: string;
  /** Förklaring under raden. */
  sub: string | null;
  tone: "idle" | "wait" | "ok" | "warn" | "bad";
}

const fmtTemp = (t: number | null) => (t === null ? "okänt" : `${String(Math.round(t)).replace("-", "−")}°`);
const DAYS = ["", "mån", "tis", "ons", "tors", "fre", "lör", "sön"];
export function daysText(days: readonly number[]): string {
  const d = [...days].sort();
  if (d.length === 7) return "varje dag";
  if (d.join() === "1,2,3,4,5") return "mån–fre";
  if (d.join() === "6,7") return "helger";
  return d.map((x) => DAYS[x]).join(", ");
}

/** Raden: en gemensam tid skrivs med dagarna, annars visas dagens (eller nästa) avresa. */
function lineOf(s: DepartureSettings, weekday: number): string {
  const days = Object.keys(s.times).map(Number).sort();
  const set = new Set(Object.values(s.times));
  if (days.length === 0) return "Inga dagar valda";
  if (set.size === 1) return `Avresa ${[...set][0]} · ${daysText(days)}`;
  const today = s.times[String(weekday)];
  if (today) return `Avresa idag ${today}`;
  const next = [...days.filter((d) => d > weekday), ...days.filter((d) => d < weekday)][0]!;
  return `Nästa avresa ${DAYS[next]} ${s.times[String(next)]}`;
}

/** Texterna som visas på kortet. */
export function departureView(s: DepartureSettings, now: Date, ctx: { tempC: number | null; climateOn: boolean | null }): DepartureView {
  const c = localClock(now);
  const base = { settings: { enabled: s.enabled, times: s.times, leadMin: s.leadMin, belowC: s.belowC, targetC: s.targetC, skippedToday: s.skipDate === c.date } };
  if (!s.enabled) return { ...base, line: "Förvärm till avresa", sub: "Av", tone: "idle" };
  const line = lineOf(s, c.weekday);
  const today = s.times[String(c.weekday)] ?? "";
  const d = decide(s, now, ctx);
  switch (d.kind) {
    case "idle": return { ...base, line, sub: "Ingen avresa idag", tone: "idle" };
    case "wait": return { ...base, line, sub: `Startar ${d.startsAt} om det är ${s.belowC}° eller kallare (nu ${fmtTemp(ctx.tempC)})`, tone: "wait" };
    case "start": return { ...base, line, sub: "Startar klimatet…", tone: "wait" };
    case "skip": return { ...base, line, sub: d.reason === "warm" ? `Hoppar över idag: ${fmtTemp(ctx.tempC)} är varmare än gränsen ${s.belowC}°` : "Klimatet går redan", tone: "warn" };
    case "skipped_user": return { ...base, line, sub: "Du hoppade över idag", tone: "warn" };
    case "missed": return { ...base, line, sub: `Förvärmningen missades. Plattan var avstängd eller utan nät kring ${hhmm(Math.max(0, minutesOf(today) - s.leadMin))}.`, tone: "bad" };
    case "done": {
      const r = d.run;
      if (r.status === "started") return { ...base, line, sub: `Klimatet startade · ${String(s.targetC).replace(".", ",")} °C klart ${today}`, tone: "ok" };
      if (r.status === "skipped_warm") return { ...base, line, sub: `Hoppade över idag: ${fmtTemp(r.tempC)} är varmare än gränsen ${s.belowC}°`, tone: "warn" };
      if (r.status === "skipped_on") return { ...base, line, sub: "Klimatet gick redan", tone: "ok" };
      if (r.status === "starting") return { ...base, line, sub: "Startar klimatet…", tone: "wait" };
      return { ...base, line, sub: "Det gick inte att starta klimatet. Starta det själv med knappen.", tone: "bad" };
    }
    default: return { ...base, line, sub: null, tone: "idle" };
  }
}

/** Det som ändras när bilen ska hoppa över idag eller inställningarna sparas. */
export interface DeparturePatch { enabled: boolean; times: Record<string, string>; leadMin: number; belowC: number; targetC: number }
