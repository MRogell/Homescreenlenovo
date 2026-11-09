import { describe, expect, it } from "vitest";
import real from "./__fixtures__/smhi-warning.json";
import { covers, fetchWarnings, parseWarnings, SMHI_WARNINGS_URL } from "./smhi";

const NOW = new Date("2026-11-09T05:00:00Z");
const ABISKO = { lat: 68.35, lon: 18.83 };
const LULEA = { lat: 65.5848, lon: 22.1547 };
const square = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const warn = (o: Record<string, unknown> = {}, geometry: unknown = { type: "Polygon", coordinates: square(10, 55, 20, 60) }) => [{ id: 1, event: { sv: "Händelse" }, warningAreas: [{ id: 10, areaName: { sv: "Område" }, warningLevel: { sv: "Gul", code: "YELLOW" }, eventDescription: { sv: "Kraftig vind" }, approximateStart: "2026-11-09T00:00:00Z", approximateEnd: "2026-11-09T12:00:00Z", area: { type: "Feature", geometry }, ...o }] }];
const IN = { lat: 57, lon: 15 };

describe("covers (punkt i område)", () => {
  it("polygon: inne och ute", () => {
    const f = { geometry: { type: "Polygon", coordinates: square(10, 55, 20, 60) } };
    expect(covers(f, 57, 15)).toBe(true);
    expect(covers(f, 61, 15)).toBe(false);
    expect(covers(f, 57, 25)).toBe(false);
  });
  it("hål i polygonen räknas som utanför", () => {
    const f = { geometry: { type: "Polygon", coordinates: [...square(10, 55, 20, 60), ...square(14, 56, 16, 58)] } };
    expect(covers(f, 57, 15)).toBe(false);
    expect(covers(f, 59, 12)).toBe(true);
  });
  it("multipolygon: i någon av delarna", () => {
    const f = { geometry: { type: "MultiPolygon", coordinates: [square(0, 0, 1, 1), square(10, 55, 20, 60)] } };
    expect(covers(f, 57, 15)).toBe(true);
    expect(covers(f, 0.5, 0.5)).toBe(true);
    expect(covers(f, 30, 30)).toBe(false);
  });
  it("trasig geometri är utanför, aldrig ett fel", () => {
    for (const f of [null, {}, { geometry: null }, { geometry: { type: "Point", coordinates: [1, 2] } }, { geometry: { type: "Polygon", coordinates: "x" } }, { geometry: { type: "Polygon", coordinates: [[["a", "b"]]] } }]) expect(covers(f, 57, 15)).toBe(false);
  });
});

describe("parseWarnings med SMHI:s riktiga svar", () => {
  it("vindvarningen för Norra Lapplandsfjällen gäller Abisko men inte Luleå", () => {
    const w = parseWarnings(real, ABISKO, NOW);
    expect(w).toEqual([{ id: 10743, level: "yellow", levelText: "Gul", title: "Vind på kalfjället", area: "Norra Lapplandsfjällen", start: "2026-11-09T02:00:00.039Z", end: "2026-11-09T13:00:00.694Z" }]);
    expect(parseWarnings(real, LULEA, NOW)).toEqual([]);
  });
  it("meddelanden (vattenbrist) är ingen varning även om platsen ligger i området", () => {
    expect(parseWarnings(real, { lat: 56.9, lon: 14.8 }, NOW)).toEqual([]);
  });
  it("slut är passerat: ingen varning kvar", () => {
    expect(parseWarnings(real, ABISKO, new Date("2026-11-09T14:00:00Z"))).toEqual([]);
  });
});

describe("parseWarnings", () => {
  it("allvarligast först, sedan tidigast start", () => {
    const json = [
      ...warn({ id: 1, warningLevel: { sv: "Gul", code: "YELLOW" }, approximateStart: "2026-11-09T01:00:00Z" }),
      ...warn({ id: 2, warningLevel: { sv: "Röd", code: "RED" } }),
      ...warn({ id: 3, warningLevel: { sv: "Orange", code: "ORANGE" } }),
      ...warn({ id: 4, warningLevel: { sv: "Gul", code: "YELLOW" }, approximateStart: "2026-11-09T00:00:00Z" }),
    ];
    expect(parseWarnings(json, IN, NOW).map((w) => w.id)).toEqual([2, 3, 4, 1]);
  });
  it("utan slutid gäller den tills vidare; start längre fram än två dygn väntar", () => {
    expect(parseWarnings(warn({ approximateEnd: undefined }), IN, NOW)).toHaveLength(1);
    expect(parseWarnings(warn({ approximateStart: "2026-11-12T00:00:00Z", approximateEnd: undefined }), IN, NOW)).toEqual([]);
    expect(parseWarnings(warn({ approximateStart: "2026-11-10T20:00:00Z", approximateEnd: undefined }), IN, NOW)).toHaveLength(1);
  });
  it("okända nivåer och trasiga poster hoppas över men resten behålls", () => {
    const json = [...warn({ warningLevel: { code: "PURPLE" } }), { warningAreas: "x" }, null, 5, ...warn({ id: 99 })];
    expect(parseWarnings(json, IN, NOW).map((w) => w.id)).toEqual([99]);
  });
  it("något som inte är en lista är ett fel (så att vädret vet att varningarna saknas)", () => {
    expect(() => parseWarnings({ x: 1 }, IN, NOW)).toThrow();
  });
});

describe("fetchWarnings", () => {
  it("hämtar från SMHI och filtrerar", async () => {
    const urls: string[] = [];
    const fetchFn = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(real)); }) as unknown as typeof fetch;
    expect((await fetchWarnings(ABISKO, NOW, fetchFn)).map((w) => w.id)).toEqual([10743]);
    expect(urls).toEqual([SMHI_WARNINGS_URL]);
  });
  it("fel från SMHI kastar", async () => {
    await expect(fetchWarnings(IN, NOW, (async () => new Response("x", { status: 503 })) as unknown as typeof fetch)).rejects.toThrow("503");
  });
});
