import { describe, expect, it } from "vitest";
import { calendarSchema } from "./schemas";
import { createCalendarProvider } from "./calendar";

const NOW = Date.parse("2026-11-08T11:05:00Z"); // söndag 12:05 svensk tid
const cal = (id: string, name: string, color: "blue" | "green" | "yellow" | "red" | "purple" = "blue") => ({ id, name, color, host: "x.example.com", url: `https://x.example.com/${id}.ics` });
const ics = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.map((e) => `BEGIN:VEVENT\n${e}\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
const ev = (uid: string, start: string, end: string, title: string) => `UID:${uid}\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${title}`;
const day = (uid: string, start: string, end: string, title: string) => `UID:${uid}\nDTSTART;VALUE=DATE:${start}\nDTEND;VALUE=DATE:${end}\nSUMMARY:${title}`;
const lookup = async () => [{ address: "142.250.74.14", family: 4 }];

function make(calendars: ReturnType<typeof cal>[], bodies: Record<string, string | number>) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    const b = bodies[url.split("/").pop()!.replace(".ics", "")];
    return typeof b === "number" ? new Response("fel", { status: b }) : new Response(b ?? "", { status: b === undefined ? 404 : 200 });
  }) as unknown as typeof fetch;
  return { p: createCalendarProvider({ loadCalendars: async () => calendars, fetchFn, lookup, nowMs: () => NOW }), calls };
}

describe("calendar provider", () => {
  it("merges calendars into today and tomorrow, all-day first, then by time, tagged with the calendar", async () => {
    const t = make([cal("a", "Familj"), cal("b", "Jobb", "green")], {
      a: ics(ev("1", "20261108T170000Z", "20261108T180000Z", "Fotboll"), day("2", "20261109", "20261110", "Skogsdag"), ev("3", "20261109T080000Z", "20261109T090000Z", "Frukost")),
      b: ics(ev("4", "20261108T070000Z", "20261108T080000Z", "Morgonmöte"), day("5", "20261108", "20261109", "Studiedag")),
    });
    const d = await t.p.getSummary();
    expect(d.today.date).toBe("2026-11-08");
    expect(d.today.events.map((e) => [e.title, e.calendarId])).toEqual([["Studiedag", "b"], ["Morgonmöte", "b"], ["Fotboll", "a"]]);
    expect(d.tomorrow.date).toBe("2026-11-09");
    expect(d.tomorrow.events.map((e) => e.title)).toEqual(["Skogsdag", "Frukost"]);
    expect(d.calendars).toEqual([{ id: "a", name: "Familj", color: "blue" }, { id: "b", name: "Jobb", color: "green" }]);
    expect(d.failed).toBe(0);
    expect(calendarSchema.safeParse(d).success).toBe(true);
  });
  it("an event that runs past midnight shows on both days; a multi-day all-day event on each day it covers", async () => {
    const t = make([cal("a", "Familj")], { a: ics(ev("1", "20261108T210000Z", "20261109T030000Z", "Nattpass"), day("2", "20261108", "20261110", "Läger")) });
    const d = await t.p.getSummary();
    expect(d.today.events.map((e) => e.title).sort()).toEqual(["Läger", "Nattpass"]);
    expect(d.tomorrow.events.map((e) => e.title).sort()).toEqual(["Läger", "Nattpass"]);
  });
  it("an event right after local midnight belongs to tomorrow, not today (UTC date is still the same)", async () => {
    const t = make([cal("a", "Familj")], { a: ics(ev("1", "20261108T233000Z", "20261109T003000Z", "Efter midnatt")) });
    const d = await t.p.getSummary();
    expect(d.today.events).toEqual([]);
    expect(d.tomorrow.events.map((e) => e.title)).toEqual(["Efter midnatt"]);
  });
  it("one calendar failing still shows the others and counts the failure", async () => {
    const t = make([cal("a", "Familj"), cal("b", "Jobb")], { a: ics(ev("1", "20261108T170000Z", "20261108T180000Z", "Fotboll")), b: 500 });
    const d = await t.p.getSummary();
    expect(d.today.events).toHaveLength(1);
    expect(d.failed).toBe(1);
  });
  it("all calendars failing, or no calendars, throws so the card shows stale or unavailable", async () => {
    await expect(make([cal("a", "Familj")], { a: 500 }).p.getSummary()).rejects.toThrow(/Kalendern/);
    await expect(make([cal("a", "Familj")], { a: "<html>logga in</html>" }).p.getSummary()).rejects.toThrow();
    await expect(make([], {}).p.getSummary()).rejects.toThrow(/kalender/i);
  });
  it("at most 25 events per day, and nothing leaks the address in an error", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ev(`m${i}`, `20261108T${String(10 + (i % 10)).padStart(2, "0")}0000Z`, `20261108T${String(10 + (i % 10)).padStart(2, "0")}3000Z`, `H${i}`));
    const d = await make([cal("a", "Familj")], { a: ics(...many) }).p.getSummary();
    expect(d.today.events).toHaveLength(25);
    const e = (await make([{ ...cal("a", "Familj"), url: "https://x.example.com/private-SECRET123/a.ics" }], { a: 500 }).p.getSummary().catch((x) => x)) as Error;
    expect(e.message).not.toContain("SECRET123");
  });
  it("is connected only when a calendar exists, refreshes every 10 minutes and has its own id", async () => {
    const t = make([cal("a", "Familj")], {});
    expect(t.p.id).toBe("calendar");
    expect(t.p.ttlSeconds).toBe(600);
    expect(await t.p.isConnected?.()).toBe(true);
    expect(await make([], {}).p.isConnected?.()).toBe(false);
  });
  it("old or garbage cached payloads fail the schema instead of crashing the page", () => {
    expect(calendarSchema.safeParse({}).success).toBe(false);
    expect(calendarSchema.safeParse(null).success).toBe(false);
  });
});
