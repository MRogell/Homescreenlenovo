import "server-only";
import { randomUUID } from "node:crypto";
import { parseEvents, type CalEvent } from "./ics";

// OBS: skrivet från CalDAV-standarden (RFC 4791) och hur iCloud brukar svara, testat mot falska svar men inte mot ett riktigt iCloud-konto.
export const ICLOUD_URL = "https://caldav.icloud.com/";
export const MAX_ICLOUD_CALENDARS = 6;

export interface CaldavCredentials { user: string; password: string }
export interface CaldavCalendar { href: string; name: string; writable: boolean }

export class CaldavError extends Error {
  constructor(public status: number, public kind: "auth" | "failed" = "failed") {
    super(kind === "auth" ? "iCloud nekade inloggningen." : `iCloud svarade ${status}`);
    this.name = "CaldavError";
  }
}

const auth = (c: CaldavCredentials) => "Basic " + Buffer.from(`${c.user}:${c.password}`).toString("base64");

async function dav(c: CaldavCredentials, url: string, method: string, body: string | undefined, headers: Record<string, string>, fetchFn: typeof fetch): Promise<{ status: number; text: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !/(^|\.)icloud\.com$/i.test(u.hostname)) throw new CaldavError(400); // bara iCloud, aldrig godtyckliga adresser
  const res = await fetchFn(u.toString(), { method, body, redirect: "manual", headers: { Authorization: auth(c), "Content-Type": "application/xml; charset=utf-8", ...headers } });
  if (res.status === 401 || res.status === 403) throw new CaldavError(res.status, "auth");
  const text = await res.text();
  if (res.status >= 400 || (res.status >= 300 && res.status < 400)) throw new CaldavError(res.status);
  return { status: res.status, text };
}

const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i");
const first = (xml: string, name: string): string | null => tag(name).exec(xml)?.[1]?.trim() ?? null;
const hrefIn = (xml: string, name: string): string | null => { const inner = first(xml, name); return inner ? first(inner, "href") : null; };
const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const responses = (xml: string) => xml.match(/<(?:[\w-]+:)?response(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];
const abs = (base: string, href: string) => new URL(href, base).toString();

const PROPFIND = (props: string) => `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"><d:prop>${props}</d:prop></d:propfind>`;

/** Hittar kalendrarna som går att ha händelser i (inte Påminnelser). Provar inloggningen samtidigt. */
export async function discoverCalendars(c: CaldavCredentials, fetchFn: typeof fetch = fetch): Promise<CaldavCalendar[]> {
  const root = await dav(c, ICLOUD_URL, "PROPFIND", PROPFIND("<d:current-user-principal/>"), { Depth: "0" }, fetchFn);
  const principalHref = hrefIn(root.text, "current-user-principal");
  if (!principalHref) throw new CaldavError(502);
  const principal = abs(ICLOUD_URL, principalHref);
  const home = await dav(c, principal, "PROPFIND", PROPFIND("<c:calendar-home-set/>"), { Depth: "0" }, fetchFn);
  const homeHref = hrefIn(home.text, "calendar-home-set");
  if (!homeHref) throw new CaldavError(502);
  const homeUrl = abs(principal, homeHref);
  const list = await dav(c, homeUrl, "PROPFIND", PROPFIND("<d:displayname/><d:resourcetype/><c:supported-calendar-component-set/>"), { Depth: "1" }, fetchFn);
  const out: CaldavCalendar[] = [];
  for (const r of responses(list.text)) {
    const href = first(r, "href");
    // iCloud skriver t.ex. <calendar xmlns="urn:ietf:params:xml:ns:caldav"/>, så attribut måste tillåtas.
    if (!href || !/<(?:[\w-]+:)?calendar(?:\s[^>]*)?\/?>/i.test(first(r, "resourcetype") ?? "")) continue;
    // Saknas komponentlistan antas händelser; bara kalendrar som uttryckligen saknar VEVENT (Påminnelser) hoppas över.
    const comps = first(r, "supported-calendar-component-set");
    if (comps !== null && !/name\s*=\s*["']VEVENT["']/i.test(comps)) continue;
    out.push({ href: abs(homeUrl, href), name: unxml(first(r, "displayname") ?? "Kalender").slice(0, 40), writable: true });
  }
  return out.slice(0, MAX_ICLOUD_CALENDARS);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Händelserna i fönstret (återkommande händelser räknas upp av parseEvents). */
export async function listCaldavEvents(c: CaldavCredentials, calendarHref: string, from: Date, to: Date, fetchFn: typeof fetch = fetch): Promise<CalEvent[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(from)}" end="${stamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await dav(c, calendarHref, "REPORT", body, { Depth: "1" }, fetchFn);
  const out: CalEvent[] = [];
  for (const r of responses(res.text)) {
    const data = first(r, "calendar-data");
    if (!data) continue;
    const ics = unxml(data.replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    try {
      out.push(...parseEvents(ics, { from, to }));
    } catch {
      // En trasig händelse får inte stoppa resten.
    }
  }
  return out;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => (line.length <= 73 ? line : line.match(/.{1,73}/g)!.join("\r\n "));
const ymd = (d: string) => d.replace(/-/g, "");

export interface NewCaldavEvent { title: string; allDay: boolean; /** Heldag: datum. Annars UTC-tid (ISO). */ start: string; /** Heldag: sista dagen (inklusive). Annars UTC-tid (ISO). */ end: string }

export function buildIcs(ev: NewCaldavEvent, uid: string, now: Date): string {
  let when: string[];
  if (ev.allDay) {
    const last = new Date(`${ev.end}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 1);
    when = [`DTSTART;VALUE=DATE:${ymd(ev.start)}`, `DTEND;VALUE=DATE:${ymd(last.toISOString().slice(0, 10))}`];
  } else {
    when = [`DTSTART:${stamp(new Date(ev.start))}`, `DTEND:${stamp(new Date(ev.end))}`];
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hemskarm//SV", "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(now)}`, ...when, fold(`SUMMARY:${esc(ev.title)}`), "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

export async function createCaldavEvent(c: CaldavCredentials, calendarHref: string, ev: NewCaldavEvent, fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<void> {
  const uid = randomUUID();
  const base = calendarHref.endsWith("/") ? calendarHref : `${calendarHref}/`;
  await dav(c, `${base}${uid}.ics`, "PUT", buildIcs(ev, uid, now), { "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*" }, fetchFn);
}

