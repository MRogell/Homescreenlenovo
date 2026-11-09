import { fetchIcs, type Lookup } from "../calendar/fetch";
import { parseEvents, type CalEvent } from "../calendar/ics";
import { dayWindow } from "../calendar/time";
import { calendarSchema, type CalendarData } from "./schemas";
import type { Provider } from "./types";

const MAX_PER_DAY = 25;

export interface CalendarSource { id: string; name: string; color: "blue" | "green" | "yellow" | "red" | "purple"; url: string }

export interface CalendarDeps {
  /** Kalendrarna med adressen i klartext (bara på servern). */
  loadCalendars: () => Promise<CalendarSource[]>;
  fetchFn?: typeof fetch;
  lookup?: Lookup;
  nowMs?: () => number;
}

type Tagged = CalEvent & { calendarId: string };

/** Händelserna som ligger (helt eller delvis) på ett dygn. Heldagar jämförs som datum, vanliga som tidpunkter. */
function onDay(events: Tagged[], date: string, from: Date, to: Date): Tagged[] {
  return events
    .filter((e) => (e.allDay ? e.start <= date && e.end > date : new Date(e.start) < to && (new Date(e.end) > from || (e.start === e.end && new Date(e.start) >= from))))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
    .slice(0, MAX_PER_DAY);
}

export function createCalendarProvider(deps: CalendarDeps): Provider<CalendarData> {
  const now = deps.nowMs ?? Date.now;
  return {
    id: "calendar",
    ttlSeconds: 120,
    timeoutMs: 20_000,
    schema: calendarSchema,
    isConnected: async () => (await deps.loadCalendars()).length > 0,
    async getSummary() {
      const calendars = await deps.loadCalendars();
      if (calendars.length === 0) throw new Error("Ingen kalender är kopplad");
      const w = dayWindow(new Date(now()));
      const results = await Promise.allSettled(
        calendars.map(async (c) => {
          const text = await fetchIcs(c.url, { fetchFn: deps.fetchFn, lookup: deps.lookup });
          return parseEvents(text, { from: w.todayStart, to: w.end }).map((e): Tagged => ({ ...e, calendarId: c.id }));
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      // Felen innehåller aldrig adressen. Svarar ingen kalender räknas kortet som ej tillgängligt (eller gammalt).
      if (failed === calendars.length) throw new Error("Kalendern svarade inte");
      const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      return {
        today: { date: w.today, events: onDay(all, w.today, w.todayStart, w.tomorrowStart) },
        tomorrow: { date: w.tomorrow, events: onDay(all, w.tomorrow, w.tomorrowStart, w.end) },
        calendars: calendars.map(({ id, name, color }) => ({ id, name, color })),
        failed,
      };
    },
  };
}
