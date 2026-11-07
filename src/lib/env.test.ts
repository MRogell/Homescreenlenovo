import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

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
