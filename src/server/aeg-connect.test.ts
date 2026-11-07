import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken } from "@/lib/crypto";
import { createPrisma } from "./db";
import { getConnectionStatus } from "./connections";
import { getAegApiKey, handleAegSetup, type AegSetupRequest } from "./aeg-connect";

const db = createPrisma(process.env.DATABASE_URL);
const SECRET = process.env.BETTER_AUTH_SECRET!;
const jwt = `h.${Buffer.from(JSON.stringify({ exp: 9_000_000_000 })).toString("base64url")}.s`;
const body = { apiKey: "KEY-123456789", accessToken: jwt, refreshToken: "REFRESH-123456789" };
const req: AegSetupRequest = { body, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };
function rec(status: number, resBody: unknown = [{ applianceId: "DW1", applianceName: "Diskmaskin", applianceType: "DW" }]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit) => { calls.push({ url, headers: init.headers as Record<string, string> }); return new Response(JSON.stringify(resBody), { status }); }) as unknown as typeof fetch;
  return { fn, calls };
}

beforeEach(async () => {
  await db.connection.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
  await db.user.create({ data: { id: "u1", name: "T", email: "t@example.com" } });
});

describe("handleAegSetup", () => {
  it("checks the credentials against Electrolux, then stores them encrypted", async () => {
    const f = rec(200);
    expect((await handleAegSetup(req, { db, fetchFn: f.fn })).status).toBe(204);
    expect(f.calls[0]!.url).toBe("https://api.developer.electrolux.one/api/v1/appliances");
    expect(f.calls[0]!.headers).toMatchObject({ Authorization: `Bearer ${jwt}`, "x-api-key": "KEY-123456789" });
    expect(await getConnectionStatus("aeg", db)).toBe("ok");
    const row = await db.connection.findFirstOrThrow({ where: { provider: "aeg" } });
    expect(JSON.stringify(row)).not.toContain("KEY-123456789");
    expect(JSON.stringify(row)).not.toContain("REFRESH-123456789");
    expect(JSON.parse(decryptToken(row.tokenEnc, SECRET))).toMatchObject({ refreshToken: "REFRESH-123456789", expiresAt: 9_000_000_000_000 });
    expect(await getAegApiKey(db)).toBe("KEY-123456789");
  });
  it("wrong credentials are refused and nothing is stored", async () => {
    const r = await handleAegSetup(req, { db, fetchFn: rec(401).fn });
    expect(r.status).toBe(400);
    expect(r.json?.error).toMatch(/nyckel|token/i);
    expect(await getConnectionStatus("aeg", db)).toBe("none");
  });
  it("Electrolux unreachable gives 502", async () => {
    expect((await handleAegSetup(req, { db, fetchFn: rec(503).fn })).status).toBe(502);
  });
  it("bad input is 400 without calling Electrolux; session and origin are checked", async () => {
    const f = rec(200);
    for (const b of [null, {}, { ...body, apiKey: "" }, { ...body, refreshToken: "har mellanslag" }, { ...body, accessToken: "x".repeat(5000) }, { ...body, extra: 1 }]) {
      expect((await handleAegSetup({ ...req, body: b }, { db, fetchFn: f.fn })).status, JSON.stringify(b)).toBe(400);
    }
    expect((await handleAegSetup({ ...req, userId: null }, { db, fetchFn: f.fn })).status).toBe(401);
    expect((await handleAegSetup({ ...req, origin: "https://ond.example.com" }, { db, fetchFn: f.fn })).status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
  it("trims pasted whitespace", async () => {
    const f = rec(200);
    await handleAegSetup({ ...req, body: { apiKey: "  KEY-123456789\n", accessToken: ` ${jwt} `, refreshToken: "REFRESH-123456789 " } }, { db, fetchFn: f.fn });
    expect(await getAegApiKey(db)).toBe("KEY-123456789");
  });
});
