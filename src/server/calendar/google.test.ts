import { describe, expect, it } from "vitest";
import { createCalendarProvider } from "../providers/calendar";
import { handleCreateEvent, handleDeleteEvent } from "./events-flow";
import { createGoogleEvent, listGoogleCalendars, listGoogleEvents } from "./google";

type Call = { url: string; method: string; body: unknown };
function fake(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if ((init?.method ?? "GET") === "DELETE") return new Response(null, { status: 204 });
    const key = Object.keys(routes).find((k) => u.includes(k));
    return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const CALS = { items: [{ id: "a@x.se", summary: "Micke", primary: true, accessRole: "owner", selected: true }, { id: "fam", summary: "Familj", accessRole: "reader", selected: true }, { id: "dold", summary: "Dold", accessRole: "owner", selected: false }] };
const db = { snapshot: { deleteMany: async () => ({}) }, providerBackoff: { deleteMany: async () => ({}) } } as never;
const base = { origin: "https://h.se", host: "h.se", userId: "u1" };

describe("google kalender", () => {
  it("listar valda kalendrar, huvudkalendern först, med skrivrätt", async () => {
    const { fetchFn } = fake({ calendarList: CALS });
    expect(await listGoogleCalendars("t", fetchFn)).toEqual([{ id: "a@x.se", name: "Micke", writable: true }, { id: "fam", name: "Familj", writable: false }]);
  });

  it("läser händelser (vanliga och heldag) och hoppar över avbokade", async () => {
    const { fetchFn } = fake({ "/events": { items: [{ id: "1", summary: "Fotboll", start: { dateTime: "2026-11-17T16:30:00+01:00" }, end: { dateTime: "2026-11-17T17:30:00+01:00" } }, { id: "2", summary: "Lov", start: { date: "2026-11-17" }, end: { date: "2026-11-18" } }, { id: "3", status: "cancelled", start: { date: "2026-11-17" }, end: { date: "2026-11-18" } }] } });
    const ev = await listGoogleEvents("t", "a@x.se", new Date("2026-11-17T00:00:00Z"), new Date("2026-11-19T00:00:00Z"), fetchFn);
    expect(ev).toEqual([
      { eventId: "1", title: "Fotboll", allDay: false, start: "2026-11-17T15:30:00.000Z", end: "2026-11-17T16:30:00.000Z" },
      { eventId: "2", title: "Lov", allDay: true, start: "2026-11-17", end: "2026-11-18" },
    ]);
  });

  it("heldag skickas med exklusivt slutdatum", async () => {
    const { fetchFn, calls } = fake({ "/events": { id: "n" } });
    await createGoogleEvent("t", "c", { title: "Resa", allDay: true, start: "2026-11-20", end: "2026-11-22" }, fetchFn);
    expect(calls[0]!.body).toMatchObject({ start: { date: "2026-11-20" }, end: { date: "2026-11-23" } });
  });

  it("kalenderkortet slår ihop Google-händelser och markerar skrivbara kalendrar", async () => {
    const { fetchFn } = fake({ calendarList: CALS, "/events": { items: [{ id: "1", summary: "Simskola", start: { dateTime: "2026-11-08T16:00:00Z" }, end: { dateTime: "2026-11-08T17:00:00Z" } }] } });
    const p = createCalendarProvider({ loadCalendars: async () => [], google: { getToken: async () => "t", fetchFn }, nowMs: () => Date.parse("2026-11-08T11:05:00Z") });
    const d = await p.getSummary();
    expect(d.calendars).toEqual([expect.objectContaining({ id: "g:a@x.se", writable: true }), expect.objectContaining({ id: "g:fam", writable: false })]);
    expect(d.today.events.map((e) => [e.title, e.calendarId])).toContainEqual(["Simskola", "g:a@x.se"]);
  });
});

describe("skapa och ta bort händelse", () => {
  const ok = { connected: async () => true, getToken: async () => "t", db };
  it("kräver inloggning, samma ursprung och ansluten Google", async () => {
    expect((await handleCreateEvent({ ...base, userId: null, body: {} }, ok)).status).toBe(401);
    expect((await handleCreateEvent({ ...base, origin: "https://ond.se", body: {} }, ok)).status).toBe(403);
    expect((await handleCreateEvent({ ...base, body: { title: "X", date: "2026-11-17", start: "10:00" } }, { ...ok, connected: async () => false })).status).toBe(409);
  });

  it("skapar en vanlig händelse i huvudkalendern med svensk tid", async () => {
    const { fetchFn, calls } = fake({ calendarList: CALS, "/events": { id: "n" } });
    const r = await handleCreateEvent({ ...base, body: { title: "Tandläkare", date: "2026-11-17", allDay: false, start: "14:30", end: "15:00" } }, { ...ok, fetchFn });
    expect(r.status).toBe(200);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/calendars/a%40x.se/events");
    expect(post.body).toMatchObject({ summary: "Tandläkare", start: { dateTime: "2026-11-17T13:30:00.000Z" }, end: { dateTime: "2026-11-17T14:00:00.000Z" } });
  });

  it("nekar kalender utan skrivrätt, ogiltig tid och slut före start", async () => {
    const { fetchFn } = fake({ calendarList: CALS, "/events": { id: "n" } });
    const t = { title: "X", date: "2026-11-17", allDay: false, start: "10:00", end: "11:00" };
    expect((await handleCreateEvent({ ...base, body: { ...t, calendarId: "g:fam" } }, { ...ok, fetchFn })).status).toBe(400);
    expect((await handleCreateEvent({ ...base, body: { ...t, start: "25:00" } }, { ...ok, fetchFn })).status).toBe(400);
    expect((await handleCreateEvent({ ...base, body: { ...t, end: "09:00" } }, { ...ok, fetchFn })).status).toBe(400);
  });

  it("tar bort bara Google-händelser", async () => {
    const { fetchFn, calls } = fake({});
    expect((await handleDeleteEvent({ ...base, body: { calendarId: "abc", eventId: "1" } }, { ...ok, fetchFn })).status).toBe(400);
    expect((await handleDeleteEvent({ ...base, body: { calendarId: "g:a@x.se", eventId: "1" } }, { ...ok, fetchFn })).status).toBe(200);
    expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  });
});
