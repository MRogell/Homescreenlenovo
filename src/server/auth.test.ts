import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "./auth";
import { createPrisma } from "./db";

const db = createPrisma(process.env.DATABASE_URL);
const signup = (email: string) => auth.api.signUpEmail({ body: { email, password: "lösenord-12345", name: "Test" } });

beforeEach(async () => {
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
});

describe("auth", () => {
  it("first signup succeeds", async () => {
    const r = await signup("a@example.com");
    expect(r.user.email).toBe("a@example.com");
  });
  it("second signup is rejected", async () => {
    await signup("a@example.com");
    await expect(signup("b@example.com")).rejects.toThrow();
    expect(await db.user.count()).toBe(1);
  });
  it("concurrent signups create at most one user", async () => {
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => signup(`u${i}@example.com`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count()).toBe(1);
  });
  it("getSession returns null without cookie", async () => {
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});

describe("hastighetsgräns för inloggning", () => {
  const attempt = (ip: string) => auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip },
    body: JSON.stringify({ email: "a@example.com", password: "fel-lösenord-123" }),
  }));
  beforeEach(async () => { await db.rateLimit.deleteMany(); });

  it("stoppar gissning efter tio försök, och räknaren ligger i databasen (inte i minnet)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 13; i++) codes.push((await attempt("203.0.113.7")).status);
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429, 429]);
    expect(await db.rateLimit.count()).toBeGreaterThan(0);
  });
  it("en annan adress påverkas inte", async () => {
    for (let i = 0; i < 12; i++) await attempt("203.0.113.8");
    expect((await attempt("203.0.113.9")).status).not.toBe(429);
  });
});
