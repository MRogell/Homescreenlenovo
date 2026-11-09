import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { sameOrigin } from "../connect-flow";
import { db as defaultDb } from "../db";
import { getVapid, sendToAll, type PushDeps } from "./push";

export interface NotifyRequest { body?: unknown; origin: string | null; host: string | null; userId: string | null }
export interface NotifyResult { status: number; json: Record<string, unknown> }
export const MAX_SUBSCRIPTIONS = 10;

/** Bara kända push-tjänster (Apple, Google, Mozilla, Microsoft): servern skickar till adressen, så den får inte peka någon annanstans. */
const PUSH_SUFFIXES = [".push.apple.com", ".googleapis.com", ".push.services.mozilla.com", ".notify.windows.com"];
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    return PUSH_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch {
    return false;
  }
}

const subscribeBody = z.object({
  endpoint: z.string().max(2048).refine(isPushEndpoint),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict(),
}).strict();
const unsubscribeBody = z.object({ endpoint: z.string().min(1).max(2048) }).strict();

function gate(req: NotifyRequest, post: boolean): NotifyResult | null {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (post && !sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  return null;
}

/** Publik push-nyckel som webbläsaren behöver för att prenumerera. */
export async function handleKey(req: NotifyRequest, deps: PushDeps = {}): Promise<NotifyResult> {
  const denied = gate(req, false);
  if (denied) return denied;
  return { status: 200, json: { publicKey: (await getVapid(deps.db, deps.secret)).publicKey } };
}

export async function handleSubscribe(req: NotifyRequest, db: PrismaClient = defaultDb): Promise<NotifyResult> {
  const denied = gate(req, true);
  if (denied) return denied;
  const p = subscribeBody.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Ogiltig prenumeration." } };
  const existing = await db.pushSubscription.findUnique({ where: { endpoint: p.data.endpoint } });
  if (!existing && (await db.pushSubscription.count()) >= MAX_SUBSCRIPTIONS) return { status: 409, json: { error: "För många enheter har notiser på. Stäng av på en annan först." } };
  await db.pushSubscription.upsert({
    where: { endpoint: p.data.endpoint },
    create: { endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth },
    update: { p256dh: p.data.keys.p256dh, auth: p.data.keys.auth },
  });
  return { status: 200, json: { ok: true } };
}

export async function handleUnsubscribe(req: NotifyRequest, db: PrismaClient = defaultDb): Promise<NotifyResult> {
  const denied = gate(req, true);
  if (denied) return denied;
  const p = unsubscribeBody.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Ogiltig begäran." } };
  await db.pushSubscription.deleteMany({ where: { endpoint: p.data.endpoint } });
  return { status: 200, json: { ok: true } };
}

/** Skickar en provnotis till alla enheter. */
export async function handleTest(req: NotifyRequest, deps: PushDeps = {}): Promise<NotifyResult> {
  const denied = gate(req, true);
  if (denied) return denied;
  const delivered = await sendToAll({ title: "Hemskärmen", body: "Notiserna fungerar.", tag: "test" }, deps);
  return delivered > 0 ? { status: 200, json: { delivered } } : { status: 502, json: { error: "Ingen enhet tog emot notisen. Slå av och på notiser igen." } };
}
