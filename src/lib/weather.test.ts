import { describe, expect, it } from "vitest";
import { aqiLabel, weatherText } from "./weather";

describe("weatherText", () => {
  it.each([
    [0, "Klart"], [1, "Mestadels klart"], [2, "Halvklart"], [3, "Mulet"], [45, "Dimma"], [48, "Dimma"],
    [51, "Duggregn"], [56, "Underkylt duggregn"], [61, "Lätt regn"], [63, "Regn"], [65, "Kraftigt regn"], [66, "Underkylt regn"],
    [71, "Lätt snöfall"], [73, "Snöfall"], [75, "Kraftigt snöfall"], [77, "Snökorn"], [80, "Regnskurar"], [82, "Regnskurar"],
    [85, "Snöbyar"], [95, "Åska"], [96, "Åska med hagel"], [99, "Åska med hagel"],
  ])("code %i is %s", (code, text) => expect(weatherText(code)).toBe(text));
  it("unknown code gives a neutral text", () => expect(weatherText(42)).toBe("Okänt väder"));
});

describe("aqiLabel", () => {
  it.each([
    [0, "Bra"], [20, "Bra"], [21, "Ganska bra"], [40, "Ganska bra"], [41, "Måttlig"], [60, "Måttlig"],
    [61, "Dålig"], [80, "Dålig"], [81, "Mycket dålig"], [100, "Mycket dålig"], [101, "Extremt dålig"],
  ])("%i is %s", (aqi, label) => expect(aqiLabel(aqi)).toBe(label));
});
