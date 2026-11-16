import "server-only";
import { DEFAULT_TZ } from "./time";
import type { CalEvent } from "./ics";

const API = "https://www.googleapis.com/calendar/v3";
export const MAX_GOOGLE_CALENDARS = 6;

export interface GoogleCalendar { id: string; name: string; writable: boolean }
export type GoogleEvent = CalEvent & { eventId: string };

export class GoogleError extends Error {
  /** Googles orsakskod (t.ex. accessNotConfigured), aldrig token eller hela svaret. */
  constructor(public status: number, public reason?: string, message = `Google Kalender svarade ${status}`) {
    super(message);
    this.name = "GoogleError";
  }
}

/** Kort, begriplig orsak på svenska och vad man ska göra. */
export function googleHint(e: unknown): string {
  if (!(e instanceof GoogleError)) return "Det gick inte att nå Google. Försöker igen.";
  const r = (e.reason ?? "").toLowerCase();
  if (e.status === 401) return "Google nekade inloggningen. Anslut Google igen i Inställningar.";
  if (r.includes("accessnotconfigured") || r.includes("service_disabled")) return "Google Calendar API är inte aktiverat i Google Cloud-projektet.";
  if (r.includes("insufficient") || r.includes("scope")) return "Behörigheten saknas. Anslut Google igen och kryssa i alla rutor.";
  if (r.includes("ratelimit") || r.includes("quota") || e.status === 429) return "Google begränsar anropen just nu. Försöker igen.";
  if (e.status === 403) return `Google nekade åtkomst (${e.reason ?? "403"}). Anslut Google igen.`;
  if (e.status === 404) return "Kalendern hittades inte hos Google.";
  if (e.status >= 500) return "Google har ett tillfälligt fel. Försöker igen.";
  return `Google svarade ${e.status}${e.reason ? ` (${e.reason})` : ""}.`;
}

async function call(token: string, path: string, init: RequestInit & { fetchFn?: typeof fetch } = {}): Promise<unknown> {
  const { fetchFn = fetch, ...rest } = init;
  const res = await fetchFn(`${API}${path}`, { ...rest, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(rest.headers ?? {}) } });
  if (res.status === 204) return null;
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null;
    const reason = j?.error?.errors?.[0]?.reason ?? j?.error?.details?.[0]?.reason ?? j?.error?.status;
    throw new GoogleError(res.status, typeof reason === "string" ? reason.slice(0, 60) : undefined);
  }
  return res.json();
}

/** De valda kalendrarna i Google-kontot (högst sex), med om man får skriva i dem. */
export async function listGoogleCalendars(token: string, fetchFn?: typeof fetch): Promise<GoogleCalendar[]> {
  const j = (await call(token, "/users/me/calendarList?minAccessRole=reader&maxResults=50", { fetchFn })) as { items?: { id?: string; summary?: string; summaryOverride?: string; selected?: boolean; primary?: boolean; accessRole?: string }[] };
  const items = (j.items ?? []).filter((c) => c.id && c.selected !== false);
  // Huvudkalendern först.
  items.sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
  return items.slice(0, MAX_GOOGLE_CALENDARS).map((c) => ({ id: c.id!, name: (c.summaryOverride ?? c.summary ?? "Kalender").slice(0, 40), writable: c.accessRole === "owner" || c.accessRole === "writer" }));
}

interface RawEvent { id?: string; location?: string; status?: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }

/** Händelser i ett tidsfönster. singleEvents=true gör att återkommande händelser kommer som egna förekomster. */
export async function listGoogleEvents(token: string, calendarId: string, from: Date, to: Date, fetchFn?: typeof fetch): Promise<GoogleEvent[]> {
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "60" });
  const j = (await call(token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`, { fetchFn })) as { items?: RawEvent[] };
  const out: GoogleEvent[] = [];
  for (const e of j.items ?? []) {
    if (!e.id || e.status === "cancelled" || !e.start || !e.end) continue;
    const title = (e.summary ?? "(utan titel)").slice(0, 120);
    if (e.start.date && e.end.date) out.push({ eventId: e.id, title, allDay: true, start: e.start.date, end: e.end.date, ...(e.location ? { location: e.location.slice(0, 120) } : {}) });
    else if (e.start.dateTime && e.end.dateTime) out.push({ eventId: e.id, title, allDay: false, start: new Date(e.start.dateTime).toISOString(), end: new Date(e.end.dateTime).toISOString(), ...(e.location ? { location: e.location.slice(0, 120) } : {}) });
  }
  return out;
}

export interface NewEvent { location?: string; description?: string; /** iCal-regel utan "RRULE:". */ rrule?: string | null; title: string; allDay: boolean; /** Heldag: datum. Annars UTC-tid (ISO). */ start: string; /** Heldag: sista dagen (inklusive). Annars UTC-tid (ISO). */ end: string }

export async function createGoogleEvent(token: string, calendarId: string, ev: NewEvent, fetchFn?: typeof fetch): Promise<string> {
  let body: object;
  if (ev.allDay) {
    const last = new Date(`${ev.end}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 1); // Googles slutdatum är exklusivt.
    body = { summary: ev.title, start: { date: ev.start }, end: { date: last.toISOString().slice(0, 10) } };
    if (ev.rrule) (body as Record<string, unknown>).recurrence = [`RRULE:${ev.rrule}`];
  } else {
    body = { summary: ev.title, start: { dateTime: ev.start, timeZone: DEFAULT_TZ }, end: { dateTime: ev.end, timeZone: DEFAULT_TZ } };
    if (ev.rrule) (body as Record<string, unknown>).recurrence = [`RRULE:${ev.rrule}`];
  }
  if (ev.location) (body as Record<string, unknown>).location = ev.location;
  if (ev.description) (body as Record<string, unknown>).description = ev.description;
  const j = (await call(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(body), fetchFn })) as { id?: string };
  return j.id ?? "";
}

export async function deleteGoogleEvent(token: string, calendarId: string, eventId: string, fetchFn?: typeof fetch): Promise<void> {
  try {
    await call(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", fetchFn });
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return; // redan borta
    throw e;
  }
}

