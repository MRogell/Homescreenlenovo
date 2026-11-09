import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { applySettingsPatch } from "../settings";
import { dispatchEvents, getVapid, sendToAll, type SendFn } from "./push";

const SECRET = "x".repeat(32);
const ev = (key: string, kind: "aegDone" | "carCharged" | "carUnlockedNight" = "carCharged") => ({ kind, key, title: "T", body: "B" });
const sub = (n: number) => db.pushSubscription.create({ data: { endpoint: `https://push.example/${n}`, p256dh: "p", auth: "a" } });

beforeEach(async () => {
  await db.pushSubscription.deleteMany();
  await db.notificationEvent.deleteMany();
  await db.appSetting.deleteMany();
});

describe("getVapid", () => {
  it("skapar nycklar en gång och ger samma varje gång, även vid samtidiga anrop", async () => {
    const [a, b] = await Promise.all([getVapid(db, SECRET), getVapid(db, SECRET)]);
    expect(a).toEqual(b);
    expect(await getVapid(db, SECRET)).toEqual(a);
    expect(a.publicKey.length).toBeGreaterThan(40);
  });
  it("privata nyckeln ligger inte i klartext i databasen", async () => {
    const k = await getVapid(db, SECRET);
    const row = await db.appSetting.findUnique({ where: { key: "vapid" } });
    expect(JSON.stringify(row?.value)).not.toContain(k.privateKey);
  });
  it("ändrad hemlighet ger nya nycklar och rensar gamla prenumerationer", async () => {
    const a = await getVapid(db, SECRET);
    await sub(1);
    const b = await getVapid(db, "y".repeat(32));
    expect(b.publicKey).not.toBe(a.publicKey);
    expect(await db.pushSubscription.count()).toBe(0);
  });
});

describe("sendToAll", () => {
  it("skickar till varje prenumeration med rätt innehåll", async () => {
    await sub(1); await sub(2);
    const send = vi.fn<SendFn>().mockResolvedValue({});
    expect(await sendToAll({ title: "Hej", body: "Du", tag: "x" }, { db, secret: SECRET, subject: "https://example.com", send })).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0]![1])).toEqual({ title: "Hej", body: "Du", tag: "x", url: "/" });
    expect(send.mock.calls[0]![2].vapid.subject).toBe("https://example.com");
  });
  it("tar bort döda prenumerationer (410) men behåller vid tillfälliga fel", async () => {
    await sub(1); await sub(2); await sub(3);
    const send: SendFn = async (s) => {
      if (s.endpoint.endsWith("/1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("/2")) throw new Error("nätverk");
    };
    expect(await sendToAll({ title: "a", body: "b", tag: "c" }, { db, secret: SECRET, subject: "https://e.com", send })).toBe(1);
    const left = (await db.pushSubscription.findMany()).map((s) => s.endpoint.slice(-1)).sort();
    expect(left).toEqual(["2", "3"]);
  });
  it("utan prenumerationer skickas inget", async () => {
    const send = vi.fn<SendFn>();
    expect(await sendToAll({ title: "a", body: "b", tag: "c" }, { db, secret: SECRET, send })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("dispatchEvents", () => {
  it("skickar en händelse en gång även om den upptäcks två gånger", async () => {
    await sub(1);
    const send = vi.fn<SendFn>().mockResolvedValue({});
    const deps = { db, secret: SECRET, subject: "https://e.com", send };
    await Promise.all([dispatchEvents([ev("k1")], deps), dispatchEvents([ev("k1")], deps)]);
    await dispatchEvents([ev("k1")], deps);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("hoppar över avstängda slag (olåst på natten är av från början)", async () => {
    await sub(1);
    const send = vi.fn<SendFn>().mockResolvedValue({});
    await dispatchEvents([ev("n1", "carUnlockedNight")], { db, secret: SECRET, subject: "https://e.com", send });
    expect(send).not.toHaveBeenCalled();
    await applySettingsPatch({ notify: { aegDone: true, carCharged: true, carUnlockedNight: true } }, db);
    await dispatchEvents([ev("n1", "carUnlockedNight")], { db, secret: SECRET, subject: "https://e.com", send });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("utan prenumerationer används ingen nyckel upp (kan skickas när någon prenumererar)", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({});
    await dispatchEvents([ev("k2")], { db, secret: SECRET, subject: "https://e.com", send });
    expect(await db.notificationEvent.count()).toBe(0);
  });
  it("kastar aldrig, även om sändningen går sönder", async () => {
    await sub(1);
    const send: SendFn = async () => { throw new Error("boom"); };
    await expect(dispatchEvents([ev("k3")], { db, secret: SECRET, subject: "https://e.com", send })).resolves.toBeUndefined();
  });
  it("gamla loggrader städas bort", async () => {
    await db.notificationEvent.create({ data: { key: "old", sentAt: new Date("2020-01-01") } });
    await sub(1);
    await dispatchEvents([ev("k4")], { db, secret: SECRET, subject: "https://e.com", send: async () => ({}) });
    expect(await db.notificationEvent.findUnique({ where: { key: "old" } })).toBeNull();
  });
});
