import { describe, expect, it } from "vitest";
import { decideChargeReminder, formatCountdown } from "./smart";

const s = { enabled: true, belowPct: 40, at: "19:00" };
const at = (hm: string) => new Date(`2026-11-11T${hm}:00+01:00`);
const car = (levelPct: number | null, charging = false, levelKind: "battery" | "fuel" = "battery") => ({ levelKind, levelPct, charging });

describe("decideChargeReminder", () => {
  it("av och före klockslaget", () => {
    expect(decideChargeReminder({ ...s, enabled: false }, at("20:00"), car(10), null)).toEqual({ kind: "off" });
    expect(decideChargeReminder(s, at("18:59"), car(10), null)).toEqual({ kind: "wait" });
  });
  it("påminner om batteriet är på eller under gränsen och bilen inte laddar", () => {
    expect(decideChargeReminder(s, at("19:00"), car(37), null)).toEqual({ kind: "notify", body: "Bilen har 37 %, ladda ikväll." });
    expect(decideChargeReminder(s, at("20:00"), car(40), null).kind).toBe("notify");
  });
  it("inte om det räcker, om den laddar, eller om värdet är okänt", () => {
    expect(decideChargeReminder(s, at("19:30"), car(41), null)).toEqual({ kind: "ok" });
    expect(decideChargeReminder(s, at("19:30"), car(20, true), null)).toEqual({ kind: "ok" });
    expect(decideChargeReminder(s, at("19:30"), car(null), null)).toEqual({ kind: "unknown" });
    expect(decideChargeReminder(s, at("19:30"), null, null)).toEqual({ kind: "unknown" });
    expect(decideChargeReminder(s, at("19:30"), car(20, false, "fuel"), null)).toEqual({ kind: "unknown" });
  });
  it("en gång per dygn och bara inom fönstret", () => {
    expect(decideChargeReminder(s, at("19:30"), car(20), "2026-11-11")).toEqual({ kind: "done" });
    expect(decideChargeReminder(s, at("19:30"), car(20), "2026-11-10").kind).toBe("notify");
    expect(decideChargeReminder(s, at("22:01"), car(20), null)).toEqual({ kind: "wait" });
  });
});

describe("formatCountdown", () => {
  it("minuter, timmar och noll", () => {
    expect(formatCountdown(272_000)).toBe("04:32");
    expect(formatCountdown(3_730_000)).toBe("1:02:10");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(1)).toBe("00:01");
  });
});
