import { describe, expect, it } from "vitest";
import { CARD_ORDER } from "./card-order";

describe("CARD_ORDER", () => {
  it("starts with weather, then Spotify, then Sonos", () => {
    expect(CARD_ORDER.slice(0, 3)).toEqual(["weather", "spotify", "sonos"]);
  });
  it("ends with the cards that do not work yet: Arlo, Škoda", () => {
    expect(CARD_ORDER.slice(-2)).toEqual(["arlo", "skoda"]);
  });
  it("shows every card exactly once", () => {
    expect([...CARD_ORDER].sort()).toEqual(["aeg", "arlo", "skoda", "sonos", "spotify", "tado", "weather"]);
  });
});
