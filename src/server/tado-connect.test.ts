import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken } from "@/lib/crypto";
import { createPrisma } from "./db";
import { getConnectionStatus } from "./connections";
import { handleTadoPoll, handleTadoStart, type TadoRequest } from "./tado-connect";

const db = createPrisma(process.env.DATABASE_URL);
const SECRET = process.env.BETTER_AUTH_SECRET!;
const req: TadoRequest = { origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };
const NOW = 5_000_000;
const DEVICE = { device_code: "DEVCODE", user_code: "7BQ5ZQ", verification_uri_complete: "https://login.tado.com/oauth2/device?user_code=7BQ5ZQ", expires_in: 300, interval: 5 };

function rec(status: number, body: unknown) {
  let calls = 0;
  const fn = (async () => { calls++; return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
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

describe("handleTadoStart", () => {
  it("refuses without session or with another origin, without calling Tado", async () => {
    const f = rec(200, DEVICE);
    expect((await handleTadoStart({ ...req, userId: null }, { db, fetchFn: f.fn })).status).toBe(401);
    expect((await handleTadoStart({ ...req, origin: "https://ond.example.com" }, { db, fetchFn: f.fn })).status).toBe(403);
    expect(f.calls()).toBe(0);
  });
  it("returns the code and link and stores the pending device code encrypted", async () => {
    const r = await handleTadoStart(req, { db, fetchFn: rec(200, DEVICE).fn, nowMs: NOW });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ userCode: "7BQ5ZQ", verifyUrl: DEVICE.verification_uri_complete, expiresAt: NOW + 300_000, intervalS: 5 });
    const row = await db.connection.findFirstOrThrow({ where: { provider: "tado" } });
    expect(row.status).toBe("pending");
    expect(row.tokenEnc).not.toContain("DEVCODE");
    expect(JSON.parse(decryptToken(row.tokenEnc, SECRET)).deviceCode).toBe("DEVCODE");
    expect(await getConnectionStatus("tado", db)).toBe("pending");
  });
  it("Tado failing gives 502", async () => {
    expect((await handleTadoStart(req, { db, fetchFn: rec(500, {}).fn })).status).toBe(502);
  });
});

describe("handleTadoPoll", () => {
  async function started() {
    await handleTadoStart(req, { db, fetchFn: rec(200, DEVICE).fn, nowMs: NOW });
  }
  it("without a pending login gives 409", async () => {
    expect((await handleTadoPoll(req, { db, fetchFn: rec(200, {}).fn, nowMs: NOW })).status).toBe(409);
  });
  it("pending stays pending", async () => {
    await started();
    const r = await handleTadoPoll(req, { db, fetchFn: rec(400, { error: "authorization_pending" }).fn, nowMs: NOW + 5000 });
    expect(r).toEqual({ status: 200, json: { status: "pending" } });
    expect(await getConnectionStatus("tado", db)).toBe("pending");
  });
  it("approval saves tokens and the connection becomes ok", async () => {
    await started();
    const r = await handleTadoPoll(req, { db, fetchFn: rec(200, { access_token: "A", refresh_token: "R", expires_in: 600 }).fn, nowMs: NOW + 5000 });
    expect(r.json).toEqual({ status: "ok" });
    expect(await getConnectionStatus("tado", db)).toBe("ok");
    const row = await db.connection.findFirstOrThrow({ where: { provider: "tado" } });
    expect(JSON.parse(decryptToken(row.tokenEnc, SECRET))).toMatchObject({ accessToken: "A", refreshToken: "R" });
  });
  it("denied or expired removes the pending login", async () => {
    for (const error of ["access_denied", "expired_token"]) {
      await started();
      const r = await handleTadoPoll(req, { db, fetchFn: rec(400, { error }).fn, nowMs: NOW + 5000 });
      expect(r.json?.status).toBe(error === "access_denied" ? "denied" : "expired");
      expect(await getConnectionStatus("tado", db)).toBe("none");
    }
  });
  it("past the expiry time it gives expired without asking Tado", async () => {
    await started();
    const f = rec(200, {});
    const r = await handleTadoPoll(req, { db, fetchFn: f.fn, nowMs: NOW + 301_000 });
    expect(r.json?.status).toBe("expired");
    expect(f.calls()).toBe(0);
  });
  it("refuses without session or with another origin", async () => {
    await started();
    expect((await handleTadoPoll({ ...req, userId: null }, { db, fetchFn: rec(200, {}).fn })).status).toBe(401);
    expect((await handleTadoPoll({ ...req, origin: null }, { db, fetchFn: rec(200, {}).fn })).status).toBe(403);
  });
});
