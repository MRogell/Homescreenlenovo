import { fetchIcs, type Lookup } from "../calendar/fetch";
import { parseEvents, type CalEvent } from "../calendar/ics";
import { metaKey, type ActivityMeta, type FamilyMember } from "@/lib/activity";
import { discoverCalendars, listCaldavEvents, type CaldavCredentials } from "../calendar/caldav";
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
  /** iCloud (CalDAV): null när ingen är kopplad. */
  icloud?: { load: () => Promise<CaldavCredentials | null>; fetchFn?: typeof fetch };
  /** Sparade extrauppgifter (deltagare, packlista) och familjemedlemmarna. */
  loadExtras?: () => Promise<{ meta: Record<string, ActivityMeta>; family: FamilyMember[] }>;
  google?: { getToken: () => Promise<string | null>; fetchFn?: typeof fetch };
}

type Tagged = CalEvent & { calendarId: string; eventId?: string; who?: string[]; bring?: string[]; awayIds?: string[] };
const GOOGLE_COLORS = ["blue", "green", "purple", "red", "yellow"] as const;

/** Händelserna som ligger (helt eller delvis) på ett dygn. Heldagar jämförs som datum, vanliga som tidpunkter. */
function onDay(events: Tagged[], date: string, from: Date, to: Date): Tagged[] {
  return events
    .filter((e) => (e.allDay ? e.start <= date && e.end > date : new Date(e.start) < to && (new Date(e.end) > from || (e.start === e.end && new Date(e.start) >= from))))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
    // Samma händelse i två kalendrar (t.ex. Google och en iCal-länk) visas en gång.
    .filter((e, i, all) => all.findIndex((x) => x.allDay === e.allDay && x.title === e.title && x.start === e.start && x.end === e.end) === i)
    .slice(0, MAX_PER_DAY);
}

export function createCalendarProvider(deps: CalendarDeps): Provider<CalendarData> {
  const now = deps.nowMs ?? Date.now;
  return {
    id: "calendar",
    ttlSeconds: 120,
    timeoutMs: 20_000,
    schema: calendarSchema,
    isConnected: async () => (await deps.loadCalendars()).length > 0 || !!(await deps.google?.getToken().catch(() => null)) || !!(await deps.icloud?.load().catch(() => null)),
    async getSummary() {
      const calendars = await deps.loadCalendars();
      const token = deps.google ? await deps.google.getToken().catch(() => null) : null;
      const icloud = deps.icloud ? await deps.icloud.load().catch(() => null) : null;
      if (calendars.length === 0 && !token && !icloud) throw new Error("Ingen kalender är kopplad");
      const w = dayWindow(new Date(now()));
      const results = await Promise.allSettled(
        calendars.map(async (c) => {
          const text = await fetchIcs(c.url, { fetchFn: deps.fetchFn, lookup: deps.lookup });
          return parseEvents(text, { from: w.todayStart, to: w.end }).map((e): Tagged => ({ ...e, calendarId: c.id }));
        }),
      );
      const failedNames: string[] = calendars.filter((_, i) => results[i]!.status === "rejected").map((c) => c.name);
      let failed = failedNames.length;
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
          failedNames.push(...gcals.filter((_, i) => gres[i]!.status === "rejected").map((g) => g.name));
          failed += gres.filter((r) => r.status === "rejected").length;
          all.push(...gres.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
        } catch {
          failedNames.push("Google Kalender");
          failed += 1;
          total += 1;
        }
      }
      if (icloud) {
        try {
          const ical = await discoverCalendars(icloud, deps.icloud?.fetchFn);
          total += ical.length;
          const ires = await Promise.allSettled(
            ical.map(async (c, i) => {
              const id = `i:${c.href}`;
              meta.push({ id, name: c.name, color: GOOGLE_COLORS[(i + 2) % GOOGLE_COLORS.length]!, writable: c.writable });
              return (await listCaldavEvents(icloud, c.href, w.todayStart, w.end, deps.icloud?.fetchFn)).map((e): Tagged => ({ ...e, calendarId: id, ...(e.uid ? { eventId: e.uid } : {}) }));
            }),
          );
          failedNames.push(...ical.filter((_, i) => ires[i]!.status === "rejected").map((c) => c.name));
          failed += ires.filter((r) => r.status === "rejected").length;
          all.push(...ires.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
        } catch {
          failedNames.push("iCloud");
          failed += 1;
          total += 1;
        }
      }
      // Deltagare och packlista som sparats när aktiviteten lades in här.
      const extras = deps.loadExtras ? await deps.loadExtras().catch(() => null) : null;
      if (extras) {
        for (const e of all) {
          const m = e.eventId ? extras.meta[metaKey(e.calendarId, e.eventId)] : undefined;
          if (!m) continue;
          const who = m.participants.map((id) => extras.family.find((f) => f.id === id)?.name).filter((n): n is string => !!n);
          if (who.length) e.who = who;
          if (m.bring.length) e.bring = m.bring;
          if (m.away && m.participants.length) e.awayIds = m.participants;
        }
      }
      // Felen innehåller aldrig adressen. Svarar ingen kalender räknas kortet som ej tillgängligt (eller gammalt).
      if (failed >= total) throw new Error("Kalendern svarade inte");
      return {
        today: { date: w.today, events: onDay(all, w.today, w.todayStart, w.tomorrowStart) },
        tomorrow: { date: w.tomorrow, events: onDay(all, w.tomorrow, w.tomorrowStart, w.end) },
        calendars: meta,
        failed,
        failedNames: failedNames.slice(0, 6),
      };
    },
  };
}
