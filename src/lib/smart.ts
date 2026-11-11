import { localClock } from "@/server/calendar/time";
import type { SmartSettings } from "./settings";

/** Hur länge efter klockslaget en laddpåminnelse fortfarande får skickas (missas minuten, tar nästa hämtning över). */
export const CHARGE_WINDOW_MIN = 180;

export interface CarBattery { levelKind: "battery" | "fuel"; levelPct: number | null; charging: boolean }

export type ChargeDecision =
  | { kind: "off" }
  | { kind: "wait" }
  /** Dagens kontroll är gjord (antingen skickad, eller inget behövdes). */
  | { kind: "done" }
  | { kind: "unknown" }
  | { kind: "ok" }
  | { kind: "notify"; body: string };

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Laddpåminnelse: efter inställd tid, en gång per dygn, om batteriet är på eller under gränsen och bilen inte laddar.
 * Okända värden (ingen kontakt med bilen, bränslebil) ger aldrig en påminnelse.
 */
export function decideChargeReminder(s: SmartSettings["chargeReminder"], now: Date, car: CarBattery | null, checkedDate: string | null): ChargeDecision {
  if (!s.enabled) return { kind: "off" };
  const c = localClock(now);
  const start = minutesOf(s.at);
  if (c.minutes < start || c.minutes >= start + CHARGE_WINDOW_MIN) return { kind: "wait" };
  if (checkedDate === c.date) return { kind: "done" };
  if (!car || car.levelKind !== "battery" || car.levelPct === null) return { kind: "unknown" };
  if (car.charging || car.levelPct > s.belowPct) return { kind: "ok" };
  return { kind: "notify", body: `Bilen har ${Math.round(car.levelPct)} %, ladda ikväll.` };
}

/** Timer: vad servern sparar. `notified`: notisen är skickad. */
export interface TimerItem { id: string; label: string; endsAt: number; notified?: boolean }
export const MAX_TIMERS = 3;
export const MAX_TIMER_MIN = 180;

export const timerLabel = (t: Pick<TimerItem, "label">) => t.label || "Timer";

/** "04:32" eller "1:02:10" för en nedräkning. Negativt blir 00:00. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}
