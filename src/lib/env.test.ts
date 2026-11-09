import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, parseEnv, resetEnvCache } from "./env";

const base = { DATABASE_URL: "postgresql://x", BETTER_AUTH_SECRET: "a".repeat(32), BETTER_AUTH_URL: "http://localhost:3000" };

describe("parseEnv", () => {
  it("rejects secret shorter than 32 chars", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "kort" })).toThrow(/32 tecken/);
  });
  it("defaults AUTH_RATE_LIMIT_SCALE to 1", () => {
    expect(parseEnv(base).AUTH_RATE_LIMIT_SCALE).toBe(1);
  });
  it("treats empty AUTH_TRUSTED_ORIGINS as unset", () => {
    expect(parseEnv({ ...base, AUTH_TRUSTED_ORIGINS: "" }).AUTH_TRUSTED_ORIGINS).toBeUndefined();
  });
});

describe("weather place", () => {
  it("defaults to Luleå", () => {
    const e = parseEnv(base);
    expect([e.WEATHER_PLACE, e.WEATHER_LAT, e.WEATHER_LON]).toEqual(["Luleå", 65.5848, 22.1547]);
  });
  it("accepts another place and rejects impossible coordinates", () => {
    expect(parseEnv({ ...base, WEATHER_PLACE: "Kiruna", WEATHER_LAT: "67.85", WEATHER_LON: "20.22" }).WEATHER_LAT).toBe(67.85);
    expect(() => parseEnv({ ...base, WEATHER_LAT: "123" })).toThrow();
    expect(() => parseEnv({ ...base, WEATHER_LON: "abc" })).toThrow();
  });
});

describe("getEnv utan databasadress", () => {
  afterEach(() => { vi.unstubAllEnvs(); resetEnvCache(); });
  const setup = (phase: string) => {
    resetEnvCache();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PHASE", phase);
  };
  it("under bygget (förhandsbygge utan databas) godtas det", () => {
    setup("phase-production-build");
    expect(getEnv().DATABASE_URL).toBe("postgresql://bygge-utan-databas");
  });
  it("vid körning krävs adressen fortfarande", () => {
    setup("phase-production-server");
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });
  it("under bygget används en riktig adress om den finns", () => {
    setup("phase-production-build");
    vi.stubEnv("DATABASE_URL", "postgresql://riktig");
    expect(getEnv().DATABASE_URL).toBe("postgresql://riktig");
  });
});

describe("getEnv i Vercels Production", () => {
  afterEach(() => { vi.unstubAllEnvs(); resetEnvCache(); });
  it("ignorerar lättad hastighetsgräns", () => {
    resetEnvCache();
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "https://hem.example.com");
    vi.stubEnv("AUTH_RATE_LIMIT_SCALE", "100");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getEnv().AUTH_RATE_LIMIT_SCALE).toBe(1);
    resetEnvCache();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getEnv().AUTH_RATE_LIMIT_SCALE).toBe(100);
  });
});
