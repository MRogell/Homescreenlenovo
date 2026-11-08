import { describe, expect, it } from "vitest";
import { CARD_ORDER } from "./card-order";

describe("CARD_ORDER", () => {
  it("starts with weather, then Škoda, then Spotify and Sonos", () => {
    expect(CARD_ORDER.slice(0, 4)).toEqual(["weather", "skoda", "spotify", "sonos"]);
  });
  it("ends with Arlo, which is not supported", () => {
    expect(CARD_ORDER.at(-1)).toBe("arlo");
  });
  it("shows every card exactly once", () => {
    expect([...CARD_ORDER].sort()).toEqual(["aeg", "arlo", "skoda", "sonos", "spotify", "tado", "weather"]);
  });
});
