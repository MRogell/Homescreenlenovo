import "server-only";
import * as webpush from "web-push";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { db as defaultDb } from "../db";
import { getSettings } from "../settings";
import type { NotifyEvent } from "./events";

export interface Sub { endpoint: string; keys: { p256dh: string; auth: string } }
export type SendFn = (sub: Sub, payload: string, opts: { vapid: { subject: string; publicKey: string; privateKey: string }; TTL: number; urgency: "normal" | "high" }) => Promise<unknown>;
export interface PushDeps { db?: PrismaClient; secret?: string; subject?: string; send?: SendFn }

const VAPID_KEY = "vapid";
/** En notis som inte kunnat levereras på en timme är inte längre aktuell. */
const TTL_SECONDS = 3600;

interface StoredVapid { publicKey: string; privateEnc: string }
const isStored = (v: unknown): v is StoredVapid => !!v && typeof v === "object" && typeof (v as StoredVapid).publicKey === "string" && typeof (v as StoredVapid).privateEnc === "string";

/** Push-nycklarna skapas första gången de behövs och sparas (privata nyckeln krypterad). Inga miljövariabler behövs. */
export async function getVapid(db: PrismaClient = defaultDb, secret: string = getEnv().BETTER_AUTH_SECRET): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => {
    const row = await db.appSetting.findUnique({ where: { key: VAPID_KEY } });
    if (!isStored(row?.value)) return null;
    try {
      return { publicKey: row.value.publicKey, privateKey: decryptToken(row.value.privateEnc, secret) };
    } catch {
      return null; // ändrad hemlighet: nycklarna går inte att läsa
    }
  };
  const existing = await read();
  if (existing) return existing;
  const k = webpush.generateVAPIDKeys();
  const value = { publicKey: k.publicKey, privateEnc: encryptToken(k.privateKey, secret) };
  // Två samtidiga första anrop ska hamna på samma nycklar: bara en rad får skapas.
  await db.appSetting.createMany({ data: [{ key: VAPID_KEY, value: value as never }], skipDuplicates: true });
  const after = await read();
  if (after) return after;
  // Raden fanns men var oläsbar (annan hemlighet): ersätt den. Gamla prenumerationer slutar då gälla och rensas vid nästa sändning.
  await db.appSetting.update({ where: { key: VAPID_KEY }, data: { value: value as never } });
  await db.pushSubscription.deleteMany();
  return { publicKey: k.publicKey, privateKey: k.privateKey };
}

const realSend: SendFn = (sub, payload, o) => webpush.sendNotification(sub, payload, { vapidDetails: o.vapid, TTL: o.TTL, urgency: o.urgency });

const isGone = (e: unknown) => typeof e === "object" && e !== null && "statusCode" in e && ((e as { statusCode: number }).statusCode === 404 || (e as { statusCode: number }).statusCode === 410);

/** Skickar till alla prenumerationer. Döda (404/410) tas bort. Ger antal levererade. */
export async function sendToAll(payload: { title: string; body: string; tag: string }, deps: PushDeps = {}): Promise<number> {
  const db = deps.db ?? defaultDb;
  const subs = await db.pushSubscription.findMany();
  if (subs.length === 0) return 0;
  const vapid = await getVapid(db, deps.secret);
  const subject = deps.subject ?? getEnv().BETTER_AUTH_URL;
  const send = deps.send ?? realSend;
  const body = JSON.stringify({ ...payload, url: "/" });
  let delivered = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { vapid: { subject, ...vapid }, TTL: TTL_SECONDS, urgency: "high" });
      delivered++;
    } catch (e) {
      if (isGone(e)) await db.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
      // Andra fel (nätverk, tillfälligt): behåll prenumerationen.
    }
  }));
  return delivered;
}

/** Först till kvarn: bara en av flera enheter som upptäcker samma händelse får skicka den. */
async function claim(db: PrismaClient, key: string): Promise<boolean> {
  const r = await db.notificationEvent.createMany({ data: [{ key }], skipDuplicates: true });
  return r.count === 1;
}

/** Skickar de händelser som är påslagna i inställningarna. Fel stoppar aldrig anroparen. */
export async function dispatchEvents(events: NotifyEvent[], deps: PushDeps = {}, now: Date = new Date()): Promise<void> {
  if (events.length === 0) return;
  const db = deps.db ?? defaultDb;
  try {
    const prefs = (await getSettings(db)).notify;
    for (const e of events) {
      if (!prefs[e.kind]) continue;
      if ((await db.pushSubscription.count()) === 0) return;
      if (!(await claim(db, e.key))) continue;
      await sendToAll({ title: e.title, body: e.body, tag: e.kind }, deps);
    }
    await db.notificationEvent.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });
  } catch {
    // En trasig notis får inte fälla en uppdatering av startsidan.
  }
}
