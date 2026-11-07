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
