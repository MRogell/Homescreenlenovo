import { describe, expect, it } from "vitest";
import { describe as describeActivity, metaKey, nextHandover, parseBring, rruleFor } from "./activity";

describe("aktiviteter", () => {
  it("bygger iCal-regler för upprepning", () => {
    expect(rruleFor("NONE")).toBeNull();
    expect(rruleFor("WEEKLY")).toBe("FREQ=WEEKLY");
    expect(rruleFor("BIWEEKLY", "2026-12-20")).toBe("FREQ=WEEKLY;INTERVAL=2;UNTIL=20261220");
    expect(rruleFor("DAILY", "2026-12-20", false)).toBe("FREQ=DAILY;UNTIL=20261220T235959Z");
  });
  it("rensar packlistan: tomma rader och dubbletter bort", () => {
    expect(parseBring(" Gympapåse \n\nvattenflaska\nGYMPAPÅSE\n")).toEqual(["Gympapåse", "vattenflaska"]);
    expect(parseBring("")).toEqual([]);
  });
  it("beskrivningen visar deltagare, ansvarig och packlista", () => {
    expect(describeActivity("Ta bussen", ["Gympapåse"], ["Noah", "Luna"], "Noah")).toBe("Ta bussen\n\nDeltagare: Noah, Luna (ansvarig: Noah)\n\nAtt ta med:\n- Gympapåse");
    expect(describeActivity("", [], [])).toBe("");
  });
  it("serier delar nyckel", () => {
    expect(metaKey("g:a", "abc_20261117T150000Z")).toBe("g:a|abc");
    expect(metaKey("i:x", "uid-1")).toBe("i:x|uid-1");
  });
  it("nästa växling: idag om klockan inte passerat, annars nästa vecka", () => {
    const h = { weekday: 7, time: "16:30" }; // söndag
    expect(nextHandover("2026-11-16", 600, h)).toEqual({ date: "2026-11-22", weekday: 7, time: "16:30" }); // måndag
    expect(nextHandover("2026-11-22", 15 * 60, h).date).toBe("2026-11-22"); // söndag före 16:30
    expect(nextHandover("2026-11-22", 17 * 60, h).date).toBe("2026-11-29"); // söndag efter
  });
});
