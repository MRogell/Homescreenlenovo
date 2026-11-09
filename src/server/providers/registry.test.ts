import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./index";

describe("provider registry", () => {
  it("has exactly the real providers (no demo data, no Arlo)", () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual(["aeg", "calendar", "lists", "skoda", "sonos", "spotify", "tado", "weather"]);
  });
  it("every provider has a positive ttl", () => {
    for (const p of PROVIDERS) expect(p.ttlSeconds).toBeGreaterThan(0);
  });
});
