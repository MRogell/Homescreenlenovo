import { describe, expect, it } from "vitest";
import { addDays, BUILTIN_RECIPES, dinnerTodayLine, dishNames, findRecipe, ingredientLines, nextDays, parseDinner, parseIngredientText, recipeKey, scaleQty, weekdayOf } from "./dinner";

const TODAY = "2026-11-09"; // måndag

describe("datum", () => {
  it("veckodag och addera dagar, även över månadsskifte och sommartid", () => {
    expect(weekdayOf("2026-11-09")).toBe(1);
    expect(weekdayOf("2026-11-15")).toBe(7);
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // sommartid börjar 29 mars
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // och slutar 25 oktober
    expect(nextDays(TODAY)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  });
});

describe("parseDinner", () => {
  it.each([
    ["tacos ons", "Tacos", "2026-11-11", false],
    ["ons tacos", "Tacos", "2026-11-11", false],
    ["Pasta bolognese fredag", "Pasta bolognese", "2026-11-13", false],
    ["tacos på fredag", "Tacos", "2026-11-13", false],
    ["pizza lör", "Pizza", "2026-11-14", false],
    ["korv med mos tisdag", "Korv med mos", "2026-11-10", false],
    ["mån lax", "Lax", "2026-11-09", false],
    ["idag pasta", "Pasta", "2026-11-09", false],
    ["pannkakor imorgon", "Pannkakor", "2026-11-10", false],
    ["soppa i morgon", "Soppa", "2026-11-10", false],
    ["tacos varje fredag", "Tacos", "2026-11-13", true],
    ["varje söndag steka", "Steka", "2026-11-15", true],
    ["fredagstacos", "Tacos", "2026-11-13", true],
    ["lördagspizza", "Pizza", "2026-11-14", true],
    ["tacos", "Tacos", null, false],
  ])("%s", (inp, dish, date, habit) => expect(parseDinner(inp, TODAY)).toEqual({ dish, date, habit }));
  it("söndag samma dag räknas som idag, och tom text ger inget", () => {
    expect(parseDinner("tacos sön", "2026-11-15")).toMatchObject({ date: "2026-11-15" });
    expect(parseDinner("", TODAY)).toBeNull();
    expect(parseDinner("ons", TODAY)).toBeNull();
    expect(parseDinner("   fre   ", TODAY)).toBeNull();
  });
  it("kapar långa namn", () => expect(parseDinner(`${"x".repeat(100)} ons`, TODAY)!.dish).toHaveLength(60));
});

describe("mängder", () => {
  it("skalar efter antal personer och byter till kg", () => {
    expect(scaleQty({ name: "Nötfärs", per: 125, unit: "g" }, 4)).toBe("500 g");
    expect(scaleQty({ name: "Potatis", per: 250, unit: "g" }, 6)).toBe("1,5 kg");
    expect(scaleQty({ name: "Tacoskal", per: 3, unit: "st" }, 5)).toBe("15 st");
    expect(scaleQty({ name: "Gurka" }, 4)).toBeNull();
  });
  it("ingredienslinjer med och utan mängd", () => {
    const tacos = BUILTIN_RECIPES.find((r) => r.name === "Tacos")!;
    const lines = ingredientLines(tacos, 4);
    expect(lines).toContain("Nötfärs 500 g");
    expect(lines).toContain("Tacoskal 12 st");
    expect(lines).toContain("Gurka");
  });
});

describe("findRecipe", () => {
  it("hittar inbyggda rätter med alias, böjning och sammansatta ord", () => {
    expect(findRecipe("tacos", {}, 4)).toMatchObject({ name: "Tacos", custom: false });
    expect(findRecipe("Fredagstacos", {}, 4)?.name).toBe("Tacos");
    expect(findRecipe("pasta carbonara", {}, 4)?.name).toBe("Pasta carbonara"); // längre alias slår "pasta"
    expect(findRecipe("pasta", {}, 4)?.name).toBe("Pasta bolognese");
    expect(findRecipe("falukorv med stuvade makaroner", {}, 4)?.name).toBe("Korv med mos");
    expect(findRecipe("hemlig rätt", {}, 4)).toBeNull();
    expect(findRecipe("", {}, 4)).toBeNull();
  });
  it("egna recept går före de inbyggda, på exakt namn", () => {
    const custom = { [recipeKey("Mormors tacos")]: { name: "Mormors tacos", ingredients: ["Tacoskal 8 st", "Kyckling"] } };
    expect(findRecipe("mormors tacos", custom, 4)).toEqual({ name: "Mormors tacos", ingredients: ["Tacoskal 8 st", "Kyckling"], custom: true });
    expect(findRecipe("tacos", custom, 4)?.custom).toBe(false);
  });
  it("antal personer påverkar mängderna", () => {
    expect(findRecipe("tacos", {}, 2)!.ingredients).toContain("Nötfärs 250 g");
  });
  it("alla inbyggda rätter har ingredienser och hittas på sitt eget namn", () => {
    for (const r of BUILTIN_RECIPES) {
      expect(r.ingredients.length, r.name).toBeGreaterThan(2);
      expect(findRecipe(r.name, {}, 4)?.name, r.name).toBe(r.name);
    }
  });
});

describe("övrigt", () => {
  it("rader till egna recept", () => {
    expect(parseIngredientText("Nötfärs 500 g, Gurka\nTomater; gurka\n  \nRiven ost")).toEqual(["Nötfärs 500 g", "Gurka", "Tomater", "Riven ost"]);
    expect(parseIngredientText("")).toEqual([]);
    expect(parseIngredientText(Array.from({ length: 50 }, (_, i) => `Vara ${i}`).join("\n"))).toHaveLength(30);
  });
  it("rätter att föreslå: egna först", () => {
    expect(dishNames({ a: { name: "Mormors gryta", ingredients: [] } })[0]).toBe("Mormors gryta");
    expect(dishNames({})).toContain("Tacos");
  });
});

describe("dinnerTodayLine", () => {
  it("visar rätt och antal personer, tomt utan plan", () => {
    expect(dinnerTodayLine({ "2026-11-09": { dish: "Tacos" } }, 4, "2026-11-09")).toBe("Middag idag: Tacos · 4 personer");
    expect(dinnerTodayLine({ "2026-11-09": { dish: "Soppa" } }, 1, "2026-11-09")).toBe("Middag idag: Soppa · 1 person");
    expect(dinnerTodayLine({}, 4, "2026-11-09")).toBeNull();
  });
});
