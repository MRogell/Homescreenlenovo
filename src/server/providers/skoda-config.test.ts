import { describe, expect, it } from "vitest";
import { skodaConfigFromEnv, skodaConfigProblem } from "./skoda-config";
import { parseEnv } from "@/lib/env";

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

describe("skodaConfigProblem", () => {
  it("names missing variables without values", () => {
    expect(skodaConfigProblem({ ...base })).toBe("SKODA_BRIDGE_URL saknas, SKODA_BRIDGE_TOKEN saknas");
  });
  it("a short token is reported and gives no config, without the value", () => {
    const env = { ...base, SKODA_BRIDGE_URL: "https://b.vercel.app", SKODA_BRIDGE_TOKEN: "kort-hemligt" };
    expect(skodaConfigProblem(env)).toBe("SKODA_BRIDGE_TOKEN är kortare än 32 tecken");
    expect(skodaConfigProblem(env)).not.toContain("kort-hemligt");
    expect(skodaConfigFromEnv(env)).toBeNull();
  });
  it("an address that is not a url is reported", () => {
    expect(skodaConfigProblem({ ...base, SKODA_BRIDGE_URL: "bryggan", SKODA_BRIDGE_TOKEN: TOKEN })).toContain("SKODA_BRIDGE_URL är ingen adress");
  });
  it("a pasted /api/skoda suffix or trailing slash is removed", () => {
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_TOKEN: TOKEN, SKODA_BRIDGE_URL: "https://b.vercel.app/api/skoda" })?.url).toBe("https://b.vercel.app");
    expect(skodaConfigFromEnv({ ...base, SKODA_BRIDGE_TOKEN: TOKEN, SKODA_BRIDGE_URL: "https://b.vercel.app/" })?.url).toBe("https://b.vercel.app");
  });
});

describe("env", () => {
  it("a short Škoda token never makes the whole env invalid", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "s".repeat(40), BETTER_AUTH_URL: "https://a.app", SKODA_BRIDGE_TOKEN: " kort ", SKODA_BRIDGE_URL: "  " });
    expect(env.SKODA_BRIDGE_TOKEN).toBe("kort");
    expect(env.SKODA_BRIDGE_URL).toBeUndefined();
  });
});
