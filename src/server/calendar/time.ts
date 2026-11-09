/** Tidszonshjälp utan bibliotek: svensk tid, med rätt hantering av sommartid. */
export const DEFAULT_TZ = "Europe/Stockholm";

interface Parts { y: number; m: number; d: number; h: number; mi: number; s: number }

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  return f;
}

function partsOf(ms: number, tz: string): Parts {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second! };
}

/** Tidszonens förskjutning mot UTC vid en tidpunkt, i millisekunder. */
function offsetAt(ms: number, tz: string): number {
  const p = partsOf(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Lokal klockslag i tidszonen till en tidpunkt (UTC). Vid sommartidsbyte väljs en giltig tidpunkt. */
export function zonedToUtc(p: Parts, tz: string = DEFAULT_TZ): Date {
  const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  let utc = guess - offsetAt(guess, tz);
  utc = guess - offsetAt(utc, tz); // en andra vända täcker gränsfallen runt omställningen
  return new Date(utc);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Datumet ("YYYY-MM-DD") i tidszonen. */
export function localDate(date: Date, tz: string = DEFAULT_TZ): string {
  const p = partsOf(date.getTime(), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Midnatt (lokal tid) för datumets dygn. */
export function startOfLocalDay(date: Date, tz: string = DEFAULT_TZ): Date {
  const p = partsOf(date.getTime(), tz);
  return zonedToUtc({ y: p.y, m: p.m, d: p.d, h: 0, mi: 0, s: 0 }, tz);
}

/** Midnatt n dygn senare i lokal tid (ett dygn kan vara 23 eller 25 timmar långt). */
export function addLocalDays(startOfDay: Date, n: number, tz: string = DEFAULT_TZ): Date {
  const p = partsOf(startOfDay.getTime(), tz);
  return zonedToUtc({ y: p.y, m: p.m, d: p.d + n, h: 0, mi: 0, s: 0 }, tz);
}

export interface DayWindow { today: string; tomorrow: string; todayStart: Date; tomorrowStart: Date; end: Date }

/** Idag och imorgon i lokal tid. `end` är första ögonblicket efter imorgon. */
export function dayWindow(now: Date, tz: string = DEFAULT_TZ): DayWindow {
  const todayStart = startOfLocalDay(now, tz);
  const tomorrowStart = addLocalDays(todayStart, 1, tz);
  const end = addLocalDays(todayStart, 2, tz);
  return { today: localDate(todayStart, tz), tomorrow: localDate(tomorrowStart, tz), todayStart, tomorrowStart, end };
}

/** Datum, veckodag (1 = måndag … 7 = söndag) och minuter sedan midnatt, i tidszonen. */
export function localClock(date: Date, tz: string = DEFAULT_TZ): { date: string; weekday: number; minutes: number } {
  const p = partsOf(date.getTime(), tz);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: dow === 0 ? 7 : dow, minutes: p.h * 60 + p.mi };
}
