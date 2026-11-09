import { describe, expect, it } from "vitest";
import { CARD_ORDER } from "./card-order";

describe("CARD_ORDER", () => {
  it("starts with weather, calendar, the shopping list and Škoda", () => {
    expect(CARD_ORDER.slice(0, 4)).toEqual(["weather", "calendar", "lists", "skoda"]);
  });
  it("Arlo is removed (not supported)", () => {
    expect(CARD_ORDER).not.toContain("arlo");
  });
  it("shows every card exactly once", () => {
    expect([...CARD_ORDER].sort()).toEqual(["aeg", "calendar", "lists", "skoda", "sonos", "spotify", "tado", "weather"]);
  });
});
