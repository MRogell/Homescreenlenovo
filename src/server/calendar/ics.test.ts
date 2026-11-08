import { describe, expect, it } from "vitest";
import { IcsError, parseEvents } from "./ics";
import { dayWindow } from "./time";

const TZ = `BEGIN:VTIMEZONE
TZID:Europe/Stockholm
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
END:DAYLIGHT
END:VTIMEZONE`;
const cal = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", TZ, ...events.map((e) => `BEGIN:VEVENT\n${e}\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
const NOW = new Date("2026-11-08T11:05:00Z"); // söndag 12:05 svensk tid
const W = dayWindow(NOW);
const parse = (ics: string) => parseEvents(ics, { from: W.todayStart, to: W.end });

describe("parseEvents: single events", () => {
  it("timed event with a time zone becomes UTC instants", () => {
    const [e] = parse(cal("UID:1\nDTSTART;TZID=Europe/Stockholm:20261108T181500\nDTEND;TZID=Europe/Stockholm:20261108T190000\nSUMMARY:Fotboll"));
    expect(e).toEqual({ title: "Fotboll", allDay: false, start: "2026-11-08T17:15:00.000Z", end: "2026-11-08T18:00:00.000Z" });
  });
  it("UTC times (Z) are kept as they are", () => {
    const [e] = parse(cal("UID:2\nDTSTART:20261109T070000Z\nDTEND:20261109T080000Z\nSUMMARY:Möte"));
    expect(e).toMatchObject({ start: "2026-11-09T07:00:00.000Z", end: "2026-11-09T08:00:00.000Z" });
  });
  it("floating times (no zone) are read as Swedish time", () => {
    const [e] = parse(cal("UID:3\nDTSTART:20261109T090000\nDTEND:20261109T100000\nSUMMARY:Flytande"));
    expect(e).toMatchObject({ start: "2026-11-09T08:00:00.000Z", end: "2026-11-09T09:00:00.000Z" });
  });
  it("all-day events come as dates with an exclusive end", () => {
    const [e] = parse(cal("UID:4\nDTSTART;VALUE=DATE:20261109\nDTEND;VALUE=DATE:20261110\nSUMMARY:Studiedag"));
    expect(e).toEqual({ title: "Studiedag", allDay: true, start: "2026-11-09", end: "2026-11-10" });
  });
  it("a multi-day all-day event covers each day it spans", () => {
    const e = parse(cal("UID:5\nDTSTART;VALUE=DATE:20261107\nDTEND;VALUE=DATE:20261110\nSUMMARY:Läger"));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ allDay: true, start: "2026-11-07", end: "2026-11-10" });
  });
  it("an event without an end time gets a zero or default length, not a crash", () => {
    const e = parse(cal("UID:6\nDTSTART;TZID=Europe/Stockholm:20261108T200000\nSUMMARY:Utan slut"));
    expect(e).toHaveLength(1);
    expect(new Date(e[0]!.end).getTime()).toBeGreaterThanOrEqual(new Date(e[0]!.start).getTime());
  });
});

describe("parseEvents: window, status and privacy", () => {
  it("only events overlapping today and tomorrow are kept", () => {
    const e = parse(cal("UID:a\nDTSTART:20261106T100000Z\nDTEND:20261106T110000Z\nSUMMARY:Förra veckan", "UID:b\nDTSTART:20261110T100000Z\nDTEND:20261110T110000Z\nSUMMARY:Om två dagar", "UID:c\nDTSTART:20261108T100000Z\nDTEND:20261108T110000Z\nSUMMARY:Idag"));
    expect(e.map((x) => x.title)).toEqual(["Idag"]);
  });
  it("an event that started earlier but is still going is kept", () => {
    const e = parse(cal("UID:d\nDTSTART:20261107T220000Z\nDTEND:20261108T020000Z\nSUMMARY:Nattpass"));
    expect(e).toHaveLength(1);
  });
  it("cancelled events are dropped", () => {
    expect(parse(cal("UID:e\nSTATUS:CANCELLED\nDTSTART:20261108T100000Z\nDTEND:20261108T110000Z\nSUMMARY:Inställd"))).toEqual([]);
  });
  it("private and confidential events show no title", () => {
    const e = parse(cal("UID:f\nCLASS:PRIVATE\nDTSTART:20261108T100000Z\nDTEND:20261108T110000Z\nSUMMARY:Hemligt läkarbesök", "UID:g\nCLASS:CONFIDENTIAL\nDTSTART:20261108T120000Z\nDTEND:20261108T130000Z\nSUMMARY:Konfidentiellt"));
    expect(e.map((x) => x.title)).toEqual(["Privat händelse", "Privat händelse"]);
    expect(JSON.stringify(e)).not.toMatch(/läkarbesök|Konfidentiellt/);
  });
  it("a missing title becomes 'Utan rubrik' and long titles are cut", () => {
    const e = parse(cal("UID:h\nDTSTART:20261108T100000Z\nDTEND:20261108T110000Z", `UID:i\nDTSTART:20261108T120000Z\nDTEND:20261108T130000Z\nSUMMARY:${"x".repeat(300)}`));
    expect(e[0]!.title).toBe("Utan rubrik");
    expect(e[1]!.title.length).toBeLessThanOrEqual(120);
  });
  it("results are sorted: all-day first, then by start time", () => {
    const e = parse(cal("UID:j\nDTSTART:20261108T150000Z\nDTEND:20261108T160000Z\nSUMMARY:Sen", "UID:k\nDTSTART:20261108T080000Z\nDTEND:20261108T090000Z\nSUMMARY:Tidig", "UID:l\nDTSTART;VALUE=DATE:20261108\nDTEND;VALUE=DATE:20261109\nSUMMARY:Heldag"));
    expect(e.map((x) => x.title)).toEqual(["Heldag", "Tidig", "Sen"]);
  });
});

describe("parseEvents: recurrence", () => {
  const weekly = "UID:r\nDTSTART;TZID=Europe/Stockholm:20261026T081500\nDTEND;TZID=Europe/Stockholm:20261026T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO,SU\nSUMMARY:Återkommande";
  it("weekly events are expanded into the window", () => {
    const e = parse(cal(weekly));
    expect(e.map((x) => x.start)).toEqual(["2026-11-08T07:15:00.000Z", "2026-11-09T07:15:00.000Z"]);
  });
  it("excluded dates (EXDATE) are skipped", () => {
    const e = parse(cal(`${weekly}\nEXDATE;TZID=Europe/Stockholm:20261109T081500`));
    expect(e.map((x) => x.start)).toEqual(["2026-11-08T07:15:00.000Z"]);
  });
  it("a moved occurrence (RECURRENCE-ID) uses its new time and title", () => {
    const moved = "UID:r\nRECURRENCE-ID;TZID=Europe/Stockholm:20261109T081500\nDTSTART;TZID=Europe/Stockholm:20261109T140000\nDTEND;TZID=Europe/Stockholm:20261109T150000\nSUMMARY:Flyttad";
    const e = parse(cal(weekly, moved));
    expect(e.find((x) => x.title === "Flyttad")).toMatchObject({ start: "2026-11-09T13:00:00.000Z" });
    expect(e.some((x) => x.start === "2026-11-09T07:15:00.000Z")).toBe(false);
  });
  it("yearly all-day events (birthdays) show on the right day", () => {
    const e = parse(cal("UID:bd\nDTSTART;VALUE=DATE:20101109\nDTEND;VALUE=DATE:20101110\nRRULE:FREQ=YEARLY\nSUMMARY:Elsas födelsedag"));
    expect(e).toEqual([{ title: "Elsas födelsedag", allDay: true, start: "2026-11-09", end: "2026-11-10" }]);
  });
  it("COUNT and UNTIL end a series", () => {
    expect(parse(cal("UID:cnt\nDTSTART:20261001T080000Z\nDTEND:20261001T090000Z\nRRULE:FREQ=DAILY;COUNT=3\nSUMMARY:Tre gånger"))).toEqual([]);
    expect(parse(cal("UID:unt\nDTSTART:20261001T080000Z\nDTEND:20261001T090000Z\nRRULE:FREQ=DAILY;UNTIL=20261108T000000Z\nSUMMARY:Till idag"))).toEqual([]);
  });
  it("a daily series that started years ago is expanded quickly", () => {
    const t0 = Date.now();
    const e = parse(cal("UID:old\nDTSTART:20150101T080000Z\nDTEND:20150101T083000Z\nRRULE:FREQ=DAILY\nSUMMARY:Varje dag"));
    expect(e).toHaveLength(2);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe("parseEvents: bad input", () => {
  it("text that is not an iCal calendar is refused", () => {
    expect(() => parse("<html>inloggning</html>")).toThrow(IcsError);
    expect(() => parse("")).toThrow(IcsError);
  });
  it("a calendar with no events gives an empty list", () => {
    expect(parse(cal())).toEqual([]);
  });
  it("a broken event is skipped, the rest still show", () => {
    const e = parse(cal("UID:bad\nDTSTART:inte-ett-datum\nSUMMARY:Trasig", "UID:ok\nDTSTART:20261108T100000Z\nDTEND:20261108T110000Z\nSUMMARY:Hel"));
    expect(e.map((x) => x.title)).toEqual(["Hel"]);
  });
});
