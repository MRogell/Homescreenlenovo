import { describe, expect, it } from "vitest";
import { CARD_ORDER } from "./card-order";

describe("CARD_ORDER", () => {
  it("starts with the working cards: weather, then Spotify", () => {
    expect(CARD_ORDER.slice(0, 2)).toEqual(["weather", "spotify"]);
  });
  it("ends with the cards that do not work yet: Arlo, Škoda, Sonos", () => {
    expect(CARD_ORDER.slice(-3)).toEqual(["arlo", "skoda", "sonos"]);
  });
  it("shows every card exactly once", () => {
    expect([...CARD_ORDER].sort()).toEqual(["aeg", "arlo", "skoda", "sonos", "spotify", "tado", "weather"]);
  });
});
