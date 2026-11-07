import { describe, expect, it } from "vitest";
import { formatAgo, formatMinutes, formatTemp } from "./format";

const now = new Date("2026-11-07T12:00:00.000Z");
describe("format", () => {
  it('formatMinutes(62) is "1 h 2 min"', () => expect(formatMinutes(62)).toBe("1 h 2 min"));
  it("formatMinutes handles 0, 42 and 60", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(42)).toBe("42 min");
    expect(formatMinutes(60)).toBe("1 h");
  });
  it("formatMinutes clamps negatives to 0", () => expect(formatMinutes(-5)).toBe("0 min"));
  it('formatAgo handles future timestamps as "just nu"', () => expect(formatAgo("2026-11-07T13:00:00.000Z", now)).toBe("just nu"));
  it("formatAgo handles invalid date", () => expect(formatAgo("inte ett datum", now)).toBe("just nu"));
  it("formatAgo minutes, hours, days", () => {
    expect(formatAgo("2026-11-07T11:56:00.000Z", now)).toBe("4 min sedan");
    expect(formatAgo("2026-11-07T09:00:00.000Z", now)).toBe("3 h sedan");
    expect(formatAgo("2026-11-03T12:00:00.000Z", now)).toBe("4 dygn sedan");
  });
  it("formatTemp uses decimal comma", () => expect(formatTemp(21.4)).toBe("21,4"));
});
