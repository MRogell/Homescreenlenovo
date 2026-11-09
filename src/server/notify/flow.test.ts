import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { handleKey, handleSubscribe, handleTest, handleUnsubscribe, isPushEndpoint, MAX_SUBSCRIPTIONS, type NotifyRequest } from "./flow";
import type { SendFn } from "./push";

const SECRET = "x".repeat(32);
const EP = "https://web.push.apple.com/QAbc123";
const sub = { endpoint: EP, keys: { p256dh: "BPkey", auth: "authkey" } };
const ok: NotifyRequest = { body: sub, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };

beforeEach(async () => { await db.pushSubscription.deleteMany(); await db.appSetting.deleteMany(); });

describe("isPushEndpoint", () => {
  it.each([
    ["https://web.push.apple.com/x", true], ["https://fcm.googleapis.com/fcm/send/x", true], ["https://updates.push.services.mozilla.com/wpush/v2/x", true], ["https://db5p.notify.windows.com/?token=x", true],
    ["http://web.push.apple.com/x", false], ["https://evil.example.com/x", false], ["https://web.push.apple.com.evil.com/x", false], ["https://user:pw@web.push.apple.com/x", false],
    ["https://127.0.0.1/x", false], ["https://web.push.apple.com:8443/x", false], ["inte en url", false],
  ])("%s → %s", (u, want) => expect(isPushEndpoint(u)).toBe(want));
});

describe("åtkomst", () => {
  it("utan session 401, fel ursprung 403, och inget sparas", async () => {
    expect((await handleSubscribe({ ...ok, userId: null }, db)).status).toBe(401);
    expect((await handleSubscribe({ ...ok, origin: "https://ond.example.com" }, db)).status).toBe(403);
    expect((await handleSubscribe({ ...ok, origin: null }, db)).status).toBe(403);
    expect((await handleUnsubscribe({ ...ok, userId: null }, db)).status).toBe(401);
    expect((await handleKey({ ...ok, userId: null }, { db, secret: SECRET })).status).toBe(401);
    expect((await handleTest({ ...ok, userId: null }, { db, secret: SECRET })).status).toBe(401);
    expect(await db.pushSubscription.count()).toBe(0);
  });
  it("ogiltiga prenumerationer är 400", async () => {
    for (const body of [null, {}, { endpoint: EP }, { ...sub, extra: 1 }, { ...sub, endpoint: "https://evil.example.com/x" }, { ...sub, keys: { p256dh: "", auth: "a" } }, { ...sub, keys: { p256dh: "x", auth: "a", z: 1 } }]) {
      expect((await handleSubscribe({ ...ok, body }, db)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await db.pushSubscription.count()).toBe(0);
  });
});

describe("prenumerera", () => {
  it("sparar, och samma enhet igen uppdaterar utan dubblett", async () => {
    expect((await handleSubscribe(ok, db)).status).toBe(200);
    expect((await handleSubscribe({ ...ok, body: { ...sub, keys: { p256dh: "ny", auth: "ny" } } }, db)).status).toBe(200);
    const rows = await db.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ p256dh: "ny", auth: "ny" });
  });
  it("högst tio enheter, men en befintlig kan uppdateras", async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) await db.pushSubscription.create({ data: { endpoint: `https://web.push.apple.com/${i}`, p256dh: "p", auth: "a" } });
    expect((await handleSubscribe(ok, db)).status).toBe(409);
    expect((await handleSubscribe({ ...ok, body: { ...sub, endpoint: "https://web.push.apple.com/3" } }, db)).status).toBe(200);
  });
  it("avprenumerera tar bort enheten", async () => {
    await handleSubscribe(ok, db);
    expect((await handleUnsubscribe({ ...ok, body: { endpoint: EP } }, db)).status).toBe(200);
    expect(await db.pushSubscription.count()).toBe(0);
    expect((await handleUnsubscribe({ ...ok, body: { endpoint: 5 } }, db)).status).toBe(400);
  });
});

describe("nyckel och prov", () => {
  it("ger publik nyckel, aldrig den privata", async () => {
    const r = await handleKey(ok, { db, secret: SECRET });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(["publicKey"]);
  });
  it("prov: 200 när någon tog emot, 502 när ingen gjorde", async () => {
    await handleSubscribe(ok, db);
    const good = vi.fn<SendFn>().mockResolvedValue({});
    expect(await handleTest(ok, { db, secret: SECRET, subject: "https://e.com", send: good })).toMatchObject({ status: 200, json: { delivered: 1 } });
    const bad: SendFn = async () => { throw new Error("nej"); };
    expect((await handleTest(ok, { db, secret: SECRET, subject: "https://e.com", send: bad })).status).toBe(502);
  });
});
