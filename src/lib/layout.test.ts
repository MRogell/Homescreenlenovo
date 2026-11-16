import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, htmlAttrs, isFree, moveTo, orderedCards, sanitizeLayout, stepCard } from "./layout";
import { CARD_IDS } from "./settings";

describe("layout", () => {
  it("trasigt eller okänt värde blir standard", () => {
    expect(sanitizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(sanitizeLayout({ theme: "hacker", density: 3, text: "xl", order: "x", sizes: [] })).toEqual(DEFAULT_LAYOUT);
  });
  it("behåller giltiga val, rensar dubbletter och fyller på saknade kort sist", () => {
    const l = sanitizeLayout({ order: ["tado", "skoda", "tado", "okänd"], sizes: { skoda: "l", tado: "m", weather: "x", okänd: "s" }, theme: "skog", density: "compact", text: "l" });
    expect(l.order).toEqual(["tado", "skoda", ...CARD_IDS.filter((x) => x !== "tado" && x !== "skoda")]);
    expect(l.sizes).toEqual({ skoda: "l" });
    expect([l.theme, l.density, l.text]).toEqual(["skog", "compact", "l"]);
  });
  it("flyttar kort: dra framåt hamnar efter målet, bakåt före", () => {
    expect(moveTo(["a", "b", "c", "d"] as never, "a" as never, "c" as never)).toEqual(["b", "c", "a", "d"]);
    expect(moveTo(["a", "b", "c", "d"] as never, "d" as never, "b" as never)).toEqual(["a", "d", "b", "c"]);
    expect(moveTo(["a", "b"] as never, "a" as never, "a" as never)).toEqual(["a", "b"]);
  });
  it("pilarna flyttar ett steg och stannar vid kanten", () => {
    expect(stepCard(["a", "b", "c"] as never, "b" as never, -1)).toEqual(["b", "a", "c"]);
    expect(stepCard(["a", "b", "c"] as never, "a" as never, -1)).toEqual(["a", "b", "c"]);
    expect(stepCard(["a", "b", "c"] as never, "c" as never, 1)).toEqual(["a", "b", "c"]);
  });
  it("egen ordning används, dolda kort tas bort", () => {
    const l = sanitizeLayout({ order: ["tado", "weather"] });
    expect(orderedCards(l, CARD_IDS, ["weather"])[0]).toBe("tado");
    expect(orderedCards(l, CARD_IDS, ["weather"])).not.toContain("weather");
    expect(orderedCards(DEFAULT_LAYOUT, ["lists", "weather"], [])).toEqual(["lists", "weather"]);
  });
  it("bara ordning, storlek, luftig och text lämnar 'allt på en skärm' (tema och tät gör det inte)", () => {
    expect(isFree(DEFAULT_LAYOUT)).toBe(false);
    expect(isFree({ ...DEFAULT_LAYOUT, theme: "skog" })).toBe(false);
    expect(isFree({ ...DEFAULT_LAYOUT, density: "compact" })).toBe(false);
    expect(isFree({ ...DEFAULT_LAYOUT, density: "airy" })).toBe(true);
    expect(isFree({ ...DEFAULT_LAYOUT, text: "s" })).toBe(true);
    expect(isFree({ ...DEFAULT_LAYOUT, sizes: { skoda: "s" } })).toBe(true);
    expect(isFree({ ...DEFAULT_LAYOUT, order: ["tado"] as never })).toBe(true);
    expect(htmlAttrs({ ...DEFAULT_LAYOUT, theme: "skog", text: "l" })).toEqual({ "data-theme": "skog", "data-density": undefined, "data-text": "l", "data-free": "" });
  });
});
