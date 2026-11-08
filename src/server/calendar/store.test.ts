import { beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "../db";
import { CalendarStoreError, addCalendar, listCalendars, publicCalendars, removeCalendar } from "./store";

const db = createPrisma(process.env.DATABASE_URL);
const SECRET = "test-secret-test-secret-test-secret-123456";
const URL1 = "https://calendar.google.com/calendar/ical/x%40gmail.com/private-HEMLIGT123/basic.ics";
beforeEach(async () => { await db.appSetting.deleteMany(); });

describe("calendar store", () => {
  it("starts empty", async () => {
    expect(await listCalendars(db, SECRET)).toEqual([]);
  });
  it("saves the address encrypted and gives it back decrypted only to the server", async () => {
    const c = await addCalendar({ name: "Familj", color: "blue", url: URL1 }, db, SECRET);
    expect(c).toMatchObject({ name: "Familj", color: "blue", host: "calendar.google.com" });
    const raw = JSON.stringify((await db.appSetting.findUnique({ where: { key: "calendars" } }))!.value);
    expect(raw).not.toContain("HEMLIGT123");
    expect(raw).not.toContain("gmail.com");
    expect((await listCalendars(db, SECRET))[0]).toMatchObject({ id: c.id, url: URL1 });
  });
  it("what the browser gets never contains the address", async () => {
    await addCalendar({ name: "Familj", color: "blue", url: URL1 }, db, SECRET);
    const pub = publicCalendars(await listCalendars(db, SECRET));
    expect(JSON.stringify(pub)).not.toContain("HEMLIGT123");
    expect(pub[0]).toEqual({ id: expect.any(String), name: "Familj", color: "blue", host: "calendar.google.com" });
  });
  it("webcal addresses are stored as https", async () => {
    await addCalendar({ name: "iCloud", color: "green", url: "webcal://p01-caldav.icloud.com/published/2/abc" }, db, SECRET);
    expect((await listCalendars(db, SECRET))[0]!.url).toBe("https://p01-caldav.icloud.com/published/2/abc");
  });
  it("at most six calendars, and unique ids", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 6; i++) ids.add((await addCalendar({ name: `K${i}`, color: "blue", url: `https://example.com/${i}.ics` }, db, SECRET)).id);
    expect(ids.size).toBe(6);
    await expect(addCalendar({ name: "Sjunde", color: "blue", url: "https://example.com/7.ics" }, db, SECRET)).rejects.toMatchObject({ code: "limit" });
  });
  it("the same address cannot be added twice", async () => {
    await addCalendar({ name: "A", color: "blue", url: URL1 }, db, SECRET);
    await expect(addCalendar({ name: "B", color: "green", url: URL1 }, db, SECRET)).rejects.toMatchObject({ code: "duplicate" });
  });
  it("removing deletes only that calendar", async () => {
    const a = await addCalendar({ name: "A", color: "blue", url: "https://example.com/a.ics" }, db, SECRET);
    const b = await addCalendar({ name: "B", color: "green", url: "https://example.com/b.ics" }, db, SECRET);
    await removeCalendar(a.id, db);
    expect((await listCalendars(db, SECRET)).map((c) => c.id)).toEqual([b.id]);
    await removeCalendar("finns-inte", db); // ska inte kasta
  });
  it("a corrupt row or an entry that cannot be decrypted is skipped, never a crash", async () => {
    await db.appSetting.create({ data: { key: "calendars", value: [{ id: "x", name: "Trasig", color: "blue", host: "h", urlEnc: "v1.trasigt" }, { nej: 1 }, "text"] as never } });
    expect(await listCalendars(db, SECRET)).toEqual([]);
    await db.appSetting.update({ where: { key: "calendars" }, data: { value: "inte en lista" as never } });
    expect(await listCalendars(db, SECRET)).toEqual([]);
  });
  it("store errors have a Swedish message", () => {
    expect(new CalendarStoreError("limit").message).toMatch(/sex/i);
    expect(new CalendarStoreError("duplicate").message).toMatch(/redan/i);
  });
});
