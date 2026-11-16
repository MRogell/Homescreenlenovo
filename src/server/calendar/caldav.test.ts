import { describe, expect, it } from "vitest";
import { handleCreateEvent } from "./events-flow";
import { buildIcs, CaldavError, createCaldavEvent, discoverCalendars, listCaldavEvents } from "./caldav";

const C = { user: "a@icloud.com", password: "abcd-efgh-ijkl-mnop" };
const PRINCIPAL = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>`;
const HOME = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>https://p12-caldav.icloud.com:443/123/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>`;
const LIST = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop><d:displayname>Familj &amp; vänner</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response><d:response><d:href>/123/calendars/reminders/</d:href><d:propstat><d:prop><d:displayname>Påminnelser</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response><d:response><d:href>/123/calendars/inbox/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>`;
const ICS = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:1\nDTSTART:20261117T150000Z\nDTEND:20261117T160000Z\nSUMMARY:Handboll\nEND:VEVENT\nEND:VCALENDAR";
const REPORT = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/home/1.ics</d:href><d:propstat><d:prop><c:calendar-data>${ICS.replace(/&/g, "&amp;")}</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;

function fake(status = 207) {
  const calls: { url: string; method: string; body?: string; auth?: string }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const h = init?.headers as Record<string, string>;
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string, auth: h?.Authorization });
    if (status === 401) return new Response("", { status: 401 });
    const u = String(url);
    if (init?.method === "PUT") return new Response("", { status: 201 });
    if (init?.method === "REPORT") return new Response(REPORT, { status: 207 });
    if (u === "https://caldav.icloud.com/") return new Response(PRINCIPAL, { status: 207 });
    if (u.endsWith("/principal/")) return new Response(HOME, { status: 207 });
    return new Response(LIST, { status: 207 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe("iCloud CalDAV", () => {
  it("hittar bara kalendrar med händelser, med avkodat namn", async () => {
    const { fetchFn } = fake();
    expect(await discoverCalendars(C, fetchFn)).toEqual([{ href: "https://p12-caldav.icloud.com/123/calendars/home/", name: "Familj & vänner", writable: true }]);
  });
  it("fel lösenord ger auth-fel", async () => {
    await expect(discoverCalendars(C, fake(401).fetchFn)).rejects.toMatchObject({ kind: "auth" });
    expect(new CaldavError(401, "auth").message).not.toContain(C.password);
  });
  it("läser händelser", async () => {
    const ev = await listCaldavEvents(C, "https://p12-caldav.icloud.com/123/calendars/home/", new Date("2026-11-17T00:00:00Z"), new Date("2026-11-19T00:00:00Z"), fake().fetchFn);
    expect(ev).toEqual([{ title: "Handboll", allDay: false, start: "2026-11-17T15:00:00.000Z", end: "2026-11-17T16:00:00.000Z" }]);
  });
  it("bygger giltig iCal för vanlig och heldag", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(buildIcs({ title: "Hej, du; där", allDay: false, start: "2026-11-17T13:30:00.000Z", end: "2026-11-17T14:00:00.000Z" }, "u1", now)).toContain("DTSTART:20261117T133000Z");
    const d = buildIcs({ title: "Lov", allDay: true, start: "2026-11-20", end: "2026-11-22" }, "u2", now);
    expect(d).toContain("DTSTART;VALUE=DATE:20261120");
    expect(d).toContain("DTEND;VALUE=DATE:20261123");
    expect(buildIcs({ title: "Hej, du; där", allDay: false, start: "2026-11-17T13:30:00.000Z", end: "2026-11-17T14:00:00.000Z" }, "u1", now)).toContain("SUMMARY:Hej\\, du\; där");
  });
  it("skapar via PUT och vägrar andra värdar än iCloud", async () => {
    const { fetchFn, calls } = fake();
    await createCaldavEvent(C, "https://p12-caldav.icloud.com/123/calendars/home/", { title: "X", allDay: true, start: "2026-11-20", end: "2026-11-20" }, fetchFn);
    expect(calls[0]).toMatchObject({ method: "PUT" });
    expect(calls[0]!.url).toMatch(/home\/[0-9a-f-]+\.ics$/);
    await expect(createCaldavEvent(C, "https://ond.example.com/x/", { title: "X", allDay: true, start: "2026-11-20", end: "2026-11-20" }, fetchFn)).rejects.toBeInstanceOf(CaldavError);
  });
  it("flödet skapar i iCloud-kalender", async () => {
    const { fetchFn, calls } = fake();
    const db = { snapshot: { deleteMany: async () => ({}) }, providerBackoff: { deleteMany: async () => ({}) } } as never;
    const r = await handleCreateEvent({ origin: "https://h.se", host: "h.se", userId: "u", body: { title: "Handboll", date: "2026-11-17", allDay: false, start: "16:00", end: "17:00", calendarId: "i:https://p12-caldav.icloud.com/123/calendars/home/" } }, { db, icloud: async () => C, fetchFn });
    expect(r.status).toBe(200);
    expect(calls.some((c) => c.method === "PUT")).toBe(true);
  });
});
