import { fetchIcs, type Lookup } from "../calendar/fetch";
import { parseEvents, type CalEvent } from "../calendar/ics";
import { listGoogleCalendars, listGoogleEvents } from "../calendar/google";
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
  /** Google Kalender: null när kontot inte är anslutet. Kastar om token inte går att få. */
  google?: { getToken: () => Promise<string | null>; fetchFn?: typeof fetch };
}

type Tagged = CalEvent & { calendarId: string; eventId?: string };
const GOOGLE_COLORS = ["blue", "green", "purple", "red", "yellow"] as const;

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
    isConnected: async () => (await deps.loadCalendars()).length > 0 || !!(await deps.google?.getToken().catch(() => null)),
    async getSummary() {
      const calendars = await deps.loadCalendars();
      const token = deps.google ? await deps.google.getToken().catch(() => null) : null;
      if (calendars.length === 0 && !token) throw new Error("Ingen kalender är kopplad");
      const w = dayWindow(new Date(now()));
      const results = await Promise.allSettled(
        calendars.map(async (c) => {
          const text = await fetchIcs(c.url, { fetchFn: deps.fetchFn, lookup: deps.lookup });
          return parseEvents(text, { from: w.todayStart, to: w.end }).map((e): Tagged => ({ ...e, calendarId: c.id }));
        }),
      );
      let failed = results.filter((r) => r.status === "rejected").length;
      let total = calendars.length;
      const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const meta: { id: string; name: string; color: CalendarSource["color"]; writable?: boolean }[] = calendars.map(({ id, name, color }) => ({ id, name, color }));
      if (token) {
        try {
          const gcals = await listGoogleCalendars(token, deps.google?.fetchFn);
          total += gcals.length;
          const gres = await Promise.allSettled(
            gcals.map(async (g, i) => {
              const id = `g:${g.id}`;
              meta.push({ id, name: g.name, color: GOOGLE_COLORS[i % GOOGLE_COLORS.length]!, writable: g.writable });
              return (await listGoogleEvents(token, g.id, w.todayStart, w.end, deps.google?.fetchFn)).map((e): Tagged => ({ ...e, calendarId: id }));
            }),
          );
          failed += gres.filter((r) => r.status === "rejected").length;
          all.push(...gres.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
        } catch {
          failed += 1;
          total += 1;
        }
      }
      // Felen innehåller aldrig adressen. Svarar ingen kalender räknas kortet som ej tillgängligt (eller gammalt).
      if (failed >= total) throw new Error("Kalendern svarade inte");
      return {
        today: { date: w.today, events: onDay(all, w.today, w.todayStart, w.tomorrowStart) },
        tomorrow: { date: w.tomorrow, events: onDay(all, w.tomorrow, w.tomorrowStart, w.end) },
        calendars: meta,
        failed,
      };
    },
  };
}
