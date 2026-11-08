import { describe, expect, it } from "vitest";
import { skodaConfigFromEnv } from "./skoda-config";

const TOKEN = "t".repeat(40);
const base = { BETTER_AUTH_URL: "https://homescreenlenovo.vercel.app" };

describe("skodaConfigFromEnv", () => {
  it("without token there is no config (card shows Anslut)", () => {
    expect(skodaConfigFromEnv({ ...base })).toBeNull();
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_URL: "https://bryggan.vercel.app" })).toBeNull();
  });
  it("without the bridge address there is no config: the bridge is its own Vercel project, never the app itself", () => {
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_TOKEN: TOKEN })).toBeNull();
  });
  it("with address and token the bridge is used", () => {
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_TOKEN: TOKEN, SKODA_BRIDGE_URL: "https://hemskarm-skoda.vercel.app" })).toEqual({ url: "https://hemskarm-skoda.vercel.app", token: TOKEN });
  });
});
