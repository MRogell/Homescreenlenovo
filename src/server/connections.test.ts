import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken } from "@/lib/crypto";
import type { OAuthConfig, TokenSet } from "@/lib/oauth";
import { createPrisma } from "./db";
import { ReauthRequired, deleteConnection, getAccessToken, getConnectionStatus, saveTokens } from "./connections";

const db = createPrisma(process.env.DATABASE_URL);
const SECRET = process.env.BETTER_AUTH_SECRET!;
const NOW = 5_000_000;
const cfg: OAuthConfig = { authorizeUrl: "https://a/auth", tokenUrl: "https://a/token", clientId: "i", clientSecret: "s", scope: "x", redirectUri: "https://r/cb" };
const tokens = (over: Partial<TokenSet> = {}): TokenSet => ({ accessToken: "ACC", refreshToken: "REF", expiresAt: NOW + 3_600_000, ...over });

function counting(status: number, body: unknown, delayMs = 0) {
  let calls = 0;
  const fn = (async () => { calls++; if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { fn, calls: () => calls };
}

beforeEach(async () => {
  await db.connection.deleteMany();
  await db.snapshot.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
  await db.user.create({ data: { id: "u1", name: "T", email: "t@example.com" } });
});

describe("connections", () => {
  it("saveTokens stores ciphertext, not plaintext", async () => {
    await saveTokens("u1", "spotify", tokens(), db);
    const row = await db.connection.findFirstOrThrow();
    expect(row.tokenEnc).not.toContain("ACC");
    expect(row.tokenEnc).not.toContain("REF");
    expect(JSON.parse(decryptToken(row.tokenEnc, SECRET))).toMatchObject({ accessToken: "ACC", refreshToken: "REF" });
    expect(row.status).toBe("ok");
  });
  it("saveTokens twice updates the same row", async () => {
    await saveTokens("u1", "spotify", tokens(), db);
    await saveTokens("u1", "spotify", tokens({ accessToken: "NY" }), db);
    expect(await db.connection.count()).toBe(1);
  });
  it("getAccessToken returns stored token when valid", async () => {
    await saveTokens("u1", "spotify", tokens(), db);
    const f = counting(200, {});
    expect(await getAccessToken("spotify", { db, fetchFn: f.fn, nowMs: NOW, config: cfg })).toBe("ACC");
    expect(f.calls()).toBe(0);
  });
  it("refreshes when under 60 s left and saves the new set", async () => {
    await saveTokens("u1", "spotify", tokens({ expiresAt: NOW + 30_000 }), db);
    const f = counting(200, { access_token: "NYTT", refresh_token: "NY-REF", expires_in: 3600 });
    expect(await getAccessToken("spotify", { db, fetchFn: f.fn, nowMs: NOW, config: cfg })).toBe("NYTT");
    const row = await db.connection.findFirstOrThrow();
    expect(JSON.parse(decryptToken(row.tokenEnc, SECRET))).toMatchObject({ accessToken: "NYTT", refreshToken: "NY-REF", expiresAt: NOW + 3_600_000 });
    expect(row.lastSyncAt).not.toBeNull();
  });
  it("concurrent calls cause exactly one refresh", async () => {
    await saveTokens("u1", "sonos", tokens({ expiresAt: NOW - 1 }), db);
    const f = counting(200, { access_token: "NYTT", expires_in: 3600 }, 30);
    const r = await Promise.all([1, 2, 3, 4, 5].map(() => getAccessToken("sonos", { db, fetchFn: f.fn, nowMs: NOW, config: cfg })));
    expect(f.calls()).toBe(1);
    expect(new Set(r)).toEqual(new Set(["NYTT"]));
  });
  it("invalid_grant marks reauth and throws ReauthRequired", async () => {
    await saveTokens("u1", "spotify", tokens({ expiresAt: NOW - 1 }), db);
    const f = counting(400, { error: "invalid_grant" });
    await expect(getAccessToken("spotify", { db, fetchFn: f.fn, nowMs: NOW, config: cfg })).rejects.toBeInstanceOf(ReauthRequired);
    expect(await getConnectionStatus("spotify", db)).toBe("reauth");
  });
  it("server error during refresh does not mark reauth", async () => {
    await saveTokens("u1", "spotify", tokens({ expiresAt: NOW - 1 }), db);
    const f = counting(503, {});
    await expect(getAccessToken("spotify", { db, fetchFn: f.fn, nowMs: NOW, config: cfg })).rejects.toThrow();
    expect(await getConnectionStatus("spotify", db)).toBe("ok");
  });
  it("undecryptable tokens (changed secret) mark reauth", async () => {
    await saveTokens("u1", "spotify", tokens(), db);
    await db.connection.updateMany({ data: { tokenEnc: "v1.AAAA.BBBB.CCCC" } });
    await expect(getAccessToken("spotify", { db, nowMs: NOW, config: cfg })).rejects.toBeInstanceOf(ReauthRequired);
    expect(await getConnectionStatus("spotify", db)).toBe("reauth");
  });
  it("getAccessToken without connection throws ReauthRequired", async () => {
    await expect(getAccessToken("spotify", { db, nowMs: NOW, config: cfg })).rejects.toBeInstanceOf(ReauthRequired);
  });
  it("deleteConnection removes connection and snapshots", async () => {
    await saveTokens("u1", "spotify", tokens(), db);
    await db.snapshot.create({ data: { provider: "spotify", payload: {}, fetchedAt: new Date() } });
    await db.snapshot.create({ data: { provider: "tado", payload: {}, fetchedAt: new Date() } });
    await deleteConnection("spotify", db);
    expect(await db.connection.count()).toBe(0);
    expect((await db.snapshot.findMany()).map((s) => s.provider)).toEqual(["tado"]);
  });
  it("getConnectionStatus returns none/ok/reauth", async () => {
    expect(await getConnectionStatus("spotify", db)).toBe("none");
    await saveTokens("u1", "spotify", tokens(), db);
    expect(await getConnectionStatus("spotify", db)).toBe("ok");
    await db.connection.updateMany({ data: { status: "reauth" } });
    expect(await getConnectionStatus("spotify", db)).toBe("reauth");
  });
});

describe("refresh lock across instances", () => {
  it("a second caller that waited for the lock reads the fresh tokens instead of refreshing again", async () => {
    await saveTokens("u1", "sonos", tokens({ expiresAt: NOW - 1 }), db);
    // Två oberoende klienter mot samma databas simulerar två serverinstanser (ingen delad minnesstatus).
    const db2 = createPrisma(process.env.DATABASE_URL);
    const f = counting(200, { access_token: "NYTT", refresh_token: "NY", expires_in: 3600 }, 40);
    try {
      const r = await Promise.all([
        getAccessToken("sonos", { db, fetchFn: f.fn, nowMs: NOW, config: cfg }),
        getAccessToken("sonos", { db: db2, fetchFn: f.fn, nowMs: NOW, config: cfg }),
      ]);
      expect(f.calls()).toBe(1);
      expect(r).toEqual(["NYTT", "NYTT"]);
    } finally {
      await db2.$disconnect();
    }
  });
});
