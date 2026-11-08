import { beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "../db";
import { handleAddCalendar, handleRemoveCalendar, type CalendarRequest } from "./flow";
import { listCalendars } from "./store";

const db = createPrisma(process.env.DATABASE_URL);
const SECRET = "test-secret-test-secret-test-secret-123456";
const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261108T100000Z\r\nDTEND:20261108T110000Z\r\nSUMMARY:Hej\r\nEND:VEVENT\r\nEND:VCALENDAR";
const URL1 = "https://calendar.google.com/calendar/ical/x/private-HEMLIGT123/basic.ics";
const lookup = async () => [{ address: "142.250.74.14", family: 4 }];
const fetchOk = (body = ICS, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
const deps = (fetchFn = fetchOk()) => ({ db, secret: SECRET, fetchFn, lookup });
const ok: CalendarRequest = { body: { name: "Familj", color: "blue", url: URL1 }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };

beforeEach(async () => {
  await db.appSetting.deleteMany();
  await db.snapshot.deleteMany();
  await db.providerBackoff.deleteMany();
  await db.snapshot.create({ data: { provider: "calendar", payload: {}, fetchedAt: new Date() } });
  await db.snapshot.create({ data: { provider: "spotify", payload: {}, fetchedAt: new Date() } });
});

describe("handleAddCalendar", () => {
  it("without session is 401, with another origin 403, and nothing is fetched or saved", async () => {
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response(ICS); }) as unknown as typeof fetch;
    expect((await handleAddCalendar({ ...ok, userId: null }, deps(fetchFn))).status).toBe(401);
    expect((await handleAddCalendar({ ...ok, origin: "https://ond.example.com" }, deps(fetchFn))).status).toBe(403);
    expect((await handleAddCalendar({ ...ok, origin: null }, deps(fetchFn))).status).toBe(403);
    expect(calls).toBe(0);
    expect(await listCalendars(db, SECRET)).toEqual([]);
  });
  it("invalid bodies are 400 without a fetch", async () => {
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response(ICS); }) as unknown as typeof fetch;
    for (const body of [null, {}, "x", { name: "", color: "blue", url: URL1 }, { name: "x".repeat(41), color: "blue", url: URL1 }, { name: "A", color: "pink", url: URL1 }, { name: "A", color: "blue" }, { name: "A", color: "blue", url: URL1, extra: 1 }, { name: "A", color: "blue", url: 5 }]) {
      expect((await handleAddCalendar({ ...ok, body }, deps(fetchFn))).status, JSON.stringify(body)).toBe(400);
    }
    expect(calls).toBe(0);
  });
  it("a working link is saved, the snapshot cleared, and the answer never contains the address", async () => {
    const r = await handleAddCalendar(ok, deps());
    expect(r.status).toBe(200);
    expect(r.json.calendars).toEqual([{ id: expect.any(String), name: "Familj", color: "blue", host: "calendar.google.com" }]);
    expect(JSON.stringify(r.json)).not.toContain("HEMLIGT123");
    expect((await listCalendars(db, SECRET)).length).toBe(1);
    expect((await db.snapshot.findMany()).map((s) => s.provider)).toEqual(["spotify"]);
  });
  it("a link that is not a calendar is refused and nothing is saved", async () => {
    const r = await handleAddCalendar(ok, deps(fetchOk("<html>Logga in</html>")));
    expect(r).toMatchObject({ status: 400, json: { error: "Det här är ingen iCal-kalender." } });
    expect(await listCalendars(db, SECRET)).toEqual([]);
  });
  it("http links and private addresses are refused", async () => {
    expect((await handleAddCalendar({ ...ok, body: { ...(ok.body as object), url: "http://example.com/a.ics" } }, deps())).status).toBe(400);
    expect((await handleAddCalendar({ ...ok, body: { ...(ok.body as object), url: "https://192.168.1.5/a.ics" } }, deps())).status).toBe(400);
    expect(await listCalendars(db, SECRET)).toEqual([]);
  });
  it("a link that cannot be fetched is 502, without the address in the message", async () => {
    const r = await handleAddCalendar(ok, deps(fetchOk("nej", 500)));
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain("HEMLIGT123");
  });
  it("the same link twice is 409, and the seventh calendar is 409", async () => {
    await handleAddCalendar(ok, deps());
    expect((await handleAddCalendar({ ...ok, body: { name: "Igen", color: "green", url: URL1 } }, deps())).status).toBe(409);
    for (let i = 0; i < 5; i++) await handleAddCalendar({ ...ok, body: { name: `K${i}`, color: "red", url: `https://example.com/${i}.ics` } }, deps());
    expect((await handleAddCalendar({ ...ok, body: { name: "Sjunde", color: "red", url: "https://example.com/x.ics" } }, deps())).status).toBe(409);
  });
});

describe("handleRemoveCalendar", () => {
  it("session and origin are checked, then the calendar is removed and the snapshot cleared", async () => {
    const id = (await handleAddCalendar(ok, deps())).json.calendars![0]!.id;
    await db.snapshot.create({ data: { provider: "calendar", payload: {}, fetchedAt: new Date() } });
    expect((await handleRemoveCalendar({ ...ok, body: { id }, userId: null }, deps())).status).toBe(401);
    expect((await handleRemoveCalendar({ ...ok, body: { id }, origin: "https://ond.example.com" }, deps())).status).toBe(403);
    expect((await handleRemoveCalendar({ ...ok, body: { id: 5 } }, deps())).status).toBe(400);
    const r = await handleRemoveCalendar({ ...ok, body: { id } }, deps());
    expect(r).toMatchObject({ status: 200, json: { calendars: [] } });
    expect(await listCalendars(db, SECRET)).toEqual([]);
    expect((await db.snapshot.findMany()).map((s) => s.provider)).toEqual(["spotify"]);
  });
});
