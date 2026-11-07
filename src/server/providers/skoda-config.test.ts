import { describe, expect, it } from "vitest";
import { skodaConfigFromEnv } from "./skoda-config";

const TOKEN = "t".repeat(40);
const base = { BETTER_AUTH_URL: "https://homescreenlenovo.vercel.app" };

describe("skodaConfigFromEnv", () => {
  it("without token there is no config (card shows Anslut)", () => {
    expect(skodaConfigFromEnv({ ...base })).toBeNull();
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_URL: "https://annan.example.com" })).toBeNull();
  });
  it("defaults to the app's own address (same Vercel project)", () => {
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_TOKEN: TOKEN })).toEqual({ url: "https://homescreenlenovo.vercel.app", token: TOKEN });
  });
  it("SKODA_BRIDGE_URL overrides the address (bridge on another host or locally)", () => {
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_TOKEN: TOKEN, SKODA_BRIDGE_URL: "http://127.0.0.1:8080" })).toEqual({ url: "http://127.0.0.1:8080", token: TOKEN });
  });
});
