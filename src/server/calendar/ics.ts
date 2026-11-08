import ICAL from "ical.js";
import { DEFAULT_TZ, localDate, zonedToUtc } from "./time";

export interface CalEvent {
  title: string;
  allDay: boolean;
  /** Tidpunkt (ISO, UTC) för vanliga händelser. För heldagar: datum "YYYY-MM-DD". */
  start: string;
  /** Som `start`. För heldagar är slutdatumet exklusivt (dagen efter sista dagen). */
  end: string;
}

export class IcsError extends Error {
  constructor() {
    super("Det här är ingen iCal-kalender.");
    this.name = "IcsError";
  }
}

const MAX_TITLE = 120;
const MAX_OCCURRENCES = 20_000;

function validZone(name: string | null | undefined): string | null {
  if (!name) return null;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

/** En iCal-tid till en tidpunkt. Tid utan zon (flytande) tolkas som svensk tid, eller zonen som anges i TZID om den är giltig. */
function instant(t: ICAL.Time, tzHint: string | null): Date {
  if (t.zone && t.zone.tzid === "floating") {
    return zonedToUtc({ y: t.year, m: t.month, d: t.day, h: t.hour, mi: t.minute, s: t.second }, tzHint ?? DEFAULT_TZ);
  }
  return t.toJSDate();
}

const dateString = (t: ICAL.Time) => `${String(t.year).padStart(4, "0")}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

function titleOf(item: ICAL.Event): string {
  const cls = String(item.component.getFirstPropertyValue("class") ?? "").toUpperCase();
  if (cls === "PRIVATE" || cls === "CONFIDENTIAL") return "Privat händelse";
  const t = (item.summary ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, MAX_TITLE) : "Utan rubrik";
}

/**
 * Händelserna som överlappar fönstret, med återkommande händelser, undantag och flyttade tillfällen uträknade.
 * En trasig händelse hoppas över. Text som inte är en iCal-kalender ger IcsError.
 */
export function parseEvents(text: string, window: { from: Date; to: Date }, tz: string = DEFAULT_TZ): CalEvent[] {
  let comp: ICAL.Component;
  try {
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("ingen kalender");
    comp = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new IcsError();
  }
  ICAL.TimezoneService.reset();
  for (const z of comp.getAllSubcomponents("vtimezone")) {
    try { ICAL.TimezoneService.register(z); } catch { /* en trasig zon får inte stoppa resten */ }
  }

  const vevents = comp.getAllSubcomponents("vevent");
  const masters: ICAL.Event[] = [];
  for (const v of vevents) if (!v.hasProperty("recurrence-id")) masters.push(new ICAL.Event(v));
  for (const v of vevents) {
    if (!v.hasProperty("recurrence-id")) continue;
    try {
      const ex = new ICAL.Event(v);
      masters.find((m) => m.uid === ex.uid)?.relateException(ex);
    } catch { /* trasigt undantag: hoppa över */ }
  }

  const fromDate = localDate(window.from, tz);
  const lastDate = localDate(new Date(window.to.getTime() - 1), tz);
  const out: CalEvent[] = [];

  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const dtstart = item.component.getFirstProperty("dtstart");
    const hint = validZone(dtstart?.getParameter("tzid") as string | undefined);
    if (start.isDate) {
      const s = dateString(start);
      let e = dateString(end);
      if (e <= s) { const n = start.clone(); n.day += 1; e = dateString(n); }
      if (s <= lastDate && e > fromDate) out.push({ title: titleOf(item), allDay: true, start: s, end: e });
      return;
    }
    const s = instant(start, hint), e0 = instant(end, hint);
    const e = e0.getTime() < s.getTime() ? s : e0;
    if (s.getTime() < window.to.getTime() && (e.getTime() > window.from.getTime() || (e.getTime() === s.getTime() && s.getTime() >= window.from.getTime()))) {
      out.push({ title: titleOf(item), allDay: false, start: s.toISOString(), end: e.toISOString() });
    }
  };

  for (const ev of masters) {
    try {
      if (!ev.isRecurring()) {
        add(ev, ev.startDate, ev.endDate);
        continue;
      }
      const hint = validZone(ev.component.getFirstProperty("dtstart")?.getParameter("tzid") as string | undefined);
      const it = ev.iterator();
      let next: ICAL.Time | null;
      for (let i = 0; i < MAX_OCCURRENCES && (next = it.next()); i++) {
        const d = ev.getOccurrenceDetails(next);
        if (instant(d.startDate, hint).getTime() >= window.to.getTime() && !d.startDate.isDate) break;
        if (d.startDate.isDate && dateString(d.startDate) > lastDate) break;
        add(d.item, d.startDate, d.endDate);
      }
    } catch {
      // En trasig händelse hoppas över, resten visas.
    }
  }

  // Heldagar först, sedan i tidsordning.
  return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}
