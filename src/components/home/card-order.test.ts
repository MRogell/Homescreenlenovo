import { describe, expect, it } from "vitest";
import { CARD_ORDER } from "./card-order";

describe("CARD_ORDER", () => {
  it("starts with weather, calendar, Škoda and Spotify", () => {
    expect(CARD_ORDER.slice(0, 4)).toEqual(["weather", "calendar", "skoda", "spotify"]);
  });
  it("Arlo is removed (not supported)", () => {
    expect(CARD_ORDER).not.toContain("arlo");
  });
  it("shows every card exactly once", () => {
    expect([...CARD_ORDER].sort()).toEqual(["aeg", "calendar", "skoda", "sonos", "spotify", "tado", "weather"]);
  });
});
