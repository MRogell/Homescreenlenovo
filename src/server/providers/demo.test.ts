import { describe, expect, it } from "vitest";
import { PROVIDERS, demoProviders } from "./index";

describe("demo providers", () => {
  it("has exactly the five ids", () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual(["aeg", "arlo", "skoda", "sonos", "spotify"]);
  });
  it("every connected demo provider returns data valid for its own schema", async () => {
    for (const p of Object.values(demoProviders).filter((p) => p.connected !== false)) {
      const data = await p.getSummary();
      expect(p.schema.safeParse(data).success, p.id).toBe(true);
    }
  });
  it("has positive ttl for each provider", () => {
    for (const p of PROVIDERS) expect(p.ttlSeconds).toBeGreaterThan(0);
  });
});
