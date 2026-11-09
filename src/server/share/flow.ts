import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import type { ListsState, Op } from "@/lib/shopping";
import { sameOrigin } from "../connect-flow";
import { db as defaultDb } from "../db";
import { opsBody } from "../lists/flow";
import { loadLists, mutateLists } from "../lists/store";
import { createShare, findShare, listShares, removeShare, ShareError, type Share } from "./store";

export interface ShareRequest { body?: unknown; origin: string | null; host: string | null; userId: string | null }
export interface ShareResult { status: number; json: { error?: string; shares?: Share[] } }
export interface GuestRequest { token: string; body?: unknown; origin: string | null; host: string | null }
export interface GuestResult { status: number; json: { error?: string; lists?: ListsState; name?: string } }
export interface ShareDeps { db?: PrismaClient; secret?: string }

const createBody = z.object({ name: z.string().trim().min(1).max(60) }).strict();
const removeBody = z.object({ id: z.string().min(1).max(40) }).strict();

function ownerGate(req: ShareRequest): ShareResult | null {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  return null;
}

/** Delningarna med länkarnas nycklar. Bara för den inloggade ägaren (länkarna ger tillgång till listan). */
export async function handleListShares(req: Pick<ShareRequest, "userId">, deps: ShareDeps = {}): Promise<ShareResult> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  const db = deps.db ?? defaultDb, secret = deps.secret ?? getEnv().BETTER_AUTH_SECRET;
  return { status: 200, json: { shares: await listShares(db, secret) } };
}

/** Lägger till en familjemedlem och ger tillbaka alla (med länkarnas nycklar, bara till den inloggade ägaren). */
export async function handleCreateShare(req: ShareRequest, deps: ShareDeps = {}): Promise<ShareResult> {
  const denied = ownerGate(req);
  if (denied) return denied;
  const p = createBody.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Skriv ett namn." } };
  const db = deps.db ?? defaultDb, secret = deps.secret ?? getEnv().BETTER_AUTH_SECRET;
  try {
    await createShare(p.data.name, db, secret);
  } catch (e) {
    if (e instanceof ShareError) return { status: e.code === "name" ? 400 : 409, json: { error: e.message } };
    return { status: 500, json: { error: "Det gick inte att spara." } };
  }
  return { status: 200, json: { shares: await listShares(db, secret) } };
}

export async function handleRemoveShare(req: ShareRequest, deps: ShareDeps = {}): Promise<ShareResult> {
  const denied = ownerGate(req);
  if (denied) return denied;
  const p = removeBody.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Ogiltig begäran." } };
  const db = deps.db ?? defaultDb, secret = deps.secret ?? getEnv().BETTER_AUTH_SECRET;
  await removeShare(p.data.id, db);
  return { status: 200, json: { shares: await listShares(db, secret) } };
}

/** Hämtar listorna med en familjemedlems länk. Okänd länk ger 404, utan att säga varför. */
export async function handleGuestGet(req: Pick<GuestRequest, "token">, deps: ShareDeps = {}): Promise<GuestResult> {
  const db = deps.db ?? defaultDb, secret = deps.secret ?? getEnv().BETTER_AUTH_SECRET;
  const who = await findShare(req.token, db, secret);
  if (!who) return { status: 404, json: { error: "Länken gäller inte längre." } };
  return { status: 200, json: { lists: await loadLists(db), name: who.name } };
}

/** Sparar ändringar från en familjemedlem. Det som läggs till märks med hens namn (bestäms av servern, inte av klienten). */
export async function handleGuestPost(req: GuestRequest, deps: ShareDeps = {}): Promise<GuestResult> {
  const db = deps.db ?? defaultDb, secret = deps.secret ?? getEnv().BETTER_AUTH_SECRET;
  const who = await findShare(req.token, db, secret);
  if (!who) return { status: 404, json: { error: "Länken gäller inte längre." } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const p = opsBody.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Ogiltig begäran" } };
  const lists = await mutateLists(p.data.ops as Op[], db, Date.now(), who.name);
  await db.snapshot.deleteMany({ where: { provider: "lists" } });
  await db.providerBackoff.deleteMany({ where: { provider: "lists" } });
  return { status: 200, json: { lists, name: who.name } };
}
