import { describe, expect, it } from "vitest";
import { goalPoint, tadoView } from "./tado-view";

const room = (over: Record<string, unknown> = {}) => ({ name: "Vardagsrum", tempC: 20 as number | null, humidity: 40 as number | null, targetC: 20 as number | null, heating: false, ...over });

describe("tadoView", () => {
  it("shows the temperature with a Swedish decimal and a degree sign", () => {
    expect(tadoView([room({ tempC: 21.4 })])[0]!.temp).toBe("21,4°");
    expect(tadoView([room({ tempC: 21 })])[0]!.temp).toBe("21°");
    expect(tadoView([room({ tempC: 18.96 })])[0]!.temp).toBe("19°"); // avrundas till en decimal, och ",0" visas inte
  });
  it("the ring fills along a 15 to 25 degree scale and never goes outside it", () => {
    const arc = (t: number) => tadoView([room({ tempC: t })])[0]!.arc;
    expect(arc(15)).toBe(0);
    expect(arc(20)).toBe(0.5);
    expect(arc(25)).toBe(1);
    expect(arc(10)).toBe(0);
    expect(arc(30)).toBe(1);
  });
  it("the goal is an angle in degrees from the top, or null when unknown", () => {
    expect(tadoView([room({ targetC: 20 })])[0]!.goal).toBe(180);
    expect(tadoView([room({ targetC: 15 })])[0]!.goal).toBe(0);
    expect(tadoView([room({ targetC: 40 })])[0]!.goal).toBe(360);
    expect(tadoView([room({ targetC: null })])[0]!.goal).toBeNull();
  });
  it("tone: heating wins, then more than a degree under the goal is cold, otherwise fine", () => {
    const tone = (over: Record<string, unknown>) => tadoView([room(over)])[0]!.tone;
    expect(tone({ heating: true, tempC: 25 })).toBe("heating");
    expect(tone({ tempC: 18.9, targetC: 20 })).toBe("cold");
    expect(tone({ tempC: 19.0, targetC: 20 })).toBe("ok");
    expect(tone({ tempC: 22, targetC: 20 })).toBe("ok");
    expect(tone({ tempC: 18, targetC: null })).toBe("ok");
    expect(tone({ tempC: null })).toBe("unknown");
  });
  it("an unknown temperature shows a dash and an empty ring", () => {
    expect(tadoView([room({ tempC: null, targetC: 20 })])[0]).toMatchObject({ temp: "–", arc: 0, tone: "unknown" });
  });
  it("the spoken label names room, temperature and goal", () => {
    expect(tadoView([room({ name: "Sovrum", tempC: 18.9, targetC: 18 })])[0]!.label).toBe("Sovrum 18,9 grader, mål 18");
    expect(tadoView([room({ name: "Kök", tempC: 21, targetC: null, heating: true })])[0]!.label).toBe("Kök 21 grader, värmer");
    expect(tadoView([room({ name: "Hall", tempC: null, targetC: null })])[0]!.label).toBe("Hall, temperatur okänd");
  });
  it("no rooms gives an empty list", () => {
    expect(tadoView([])).toEqual([]);
  });
});

describe("goalPoint", () => {
  it("places the goal marker on the ring: 0 degrees is straight up, 90 is to the right", () => {
    const top = goalPoint(0), right = goalPoint(90), bottom = goalPoint(180);
    expect(top.x).toBeCloseTo(40); expect(top.y).toBeCloseTo(10);
    expect(right.x).toBeCloseTo(70); expect(right.y).toBeCloseTo(40);
    expect(bottom.x).toBeCloseTo(40); expect(bottom.y).toBeCloseTo(70);
  });
});
