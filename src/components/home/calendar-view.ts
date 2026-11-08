import { formatMinutes } from "@/lib/format";
import type { CalendarData } from "@/server/providers/schemas";

type Ev = CalendarData["today"]["events"][number];
export type CalColor = CalendarData["calendars"][number]["color"];

export interface CalEventRow { key: string; time: string; title: string; meta: string; color: CalColor }
export interface CalHero { when: string; title: string; meta: string; color: CalColor }
export interface CalAllDay { title: string; color: CalColor }
export interface CalendarView {
  pill: string;
  empty: boolean;
  hero: CalHero | null;
  allDayToday: CalAllDay[];
  /** Senare idag, utan det som redan är hjälte. */
  later: CalEventRow[];
  tomorrow: { allDay: CalAllDay[]; events: CalEventRow[] };
  /** T.ex. "1 kalender svarade inte". */
  note: string | null;
}

const TZ = "Europe/Stockholm";
const hm = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clock = (iso: string) => hm.format(new Date(iso));

/** Allt kalenderkortet visar (variant B: nästa händelse stort, resten under). Ren funktion: kortet ritar bara upp resultatet. */
export function calendarView(d: CalendarData, now: Date): CalendarView {
  const cal = new Map(d.calendars.map((c) => [c.id, c]));
  const color = (e: Ev): CalColor => cal.get(e.calendarId)?.color ?? "blue";
  const calName = (e: Ev) => cal.get(e.calendarId)?.name ?? "Kalender";
  const t = now.getTime();
  const dur = (e: Ev) => formatMinutes((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000);
  const row = (e: Ev, i: number): CalEventRow => ({ key: `${e.start}|${e.calendarId}|${i}`, time: clock(e.start), title: e.title, meta: `${calName(e)} · ${dur(e)}`, color: color(e) });
  const heroOf = (e: Ev, when: string): CalHero => ({ when, title: e.title, meta: `${clock(e.start)}–${clock(e.end)} · ${calName(e)}`, color: color(e) });

  const todayTimed = d.today.events.filter((e) => !e.allDay);
  const remaining = todayTimed.filter((e) => new Date(e.end).getTime() > t || (e.start === e.end && new Date(e.start).getTime() >= t));
  const ongoing = remaining.find((e) => new Date(e.start).getTime() <= t);
  const nextToday = ongoing ?? remaining[0];
  const tomorrowTimed = d.tomorrow.events.filter((e) => !e.allDay);

  let hero: CalHero | null = null;
  let heroToday = false;
  let heroTomorrow: Ev | undefined;
  if (nextToday) {
    heroToday = true;
    const mins = Math.max(1, Math.ceil((new Date(nextToday.start).getTime() - t) / 60_000));
    hero = heroOf(nextToday, ongoing ? "Pågår nu" : `Nästa · om ${formatMinutes(mins)}`);
  } else if (tomorrowTimed[0]) {
    heroTomorrow = tomorrowTimed[0];
    hero = heroOf(heroTomorrow, `Imorgon ${clock(heroTomorrow.start)}`);
  }

  const toAllDay = (e: Ev): CalAllDay => ({ title: e.title, color: color(e) });
  const pill = remaining.length > 0 ? `${remaining.length} kvar idag` : d.today.events.length > 0 ? "Klart för idag" : "Inget idag";
  const rest = tomorrowTimed.filter((e) => e !== heroTomorrow).slice(0, heroToday ? 1 : 2);

  return {
    pill,
    empty: d.today.events.length === 0 && d.tomorrow.events.length === 0,
    hero,
    allDayToday: d.today.events.filter((e) => e.allDay).map(toAllDay),
    later: remaining.filter((e) => e !== nextToday).map(row),
    tomorrow: { allDay: d.tomorrow.events.filter((e) => e.allDay).map(toAllDay), events: rest.map(row) },
    note: d.failed > 0 ? `${d.failed} ${d.failed === 1 ? "kalender svarade" : "kalendrar svarade"} inte` : null,
  };
}
