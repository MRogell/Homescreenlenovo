import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ListsState, Op } from "@/lib/shopping";
import { sameOrigin } from "../connect-flow";
import { db as defaultDb } from "../db";
import { loadLists, mutateLists } from "./store";

export interface ListsRequest { body?: unknown; origin: string | null; host: string | null; userId: string | null }
export interface ListsResult { status: number; json: { error?: string; lists?: ListsState } }

const id = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);
const at = z.number().int().min(0).max(8_640_000_000_000_000);
const qty = z.string().trim().max(20).nullable().optional();
const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), id, name: z.string().trim().min(1).max(120), qty, at }).strict(),
  z.object({ op: z.literal("check"), id, checked: z.boolean(), at }).strict(),
  z.object({ op: z.literal("skip"), id, skipped: z.boolean() }).strict(),
  z.object({ op: z.literal("remove"), id }).strict(),
  z.object({ op: z.literal("setQty"), id, qty: z.string().trim().max(20).nullable() }).strict(),
  z.object({ op: z.literal("clearChecked") }).strict(),
  z.object({ op: z.literal("noteAdd"), id, text: z.string().trim().min(1).max(400), at }).strict(),
  z.object({ op: z.literal("noteRemove"), id }).strict(),
  z.object({ op: z.literal("dinner"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dish: z.string().trim().max(120), at }).strict(),
  z.object({ op: z.literal("dinnerListed"), dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(14) }).strict(),
  z.object({ op: z.literal("habit"), weekday: z.number().int().min(1).max(7), dish: z.string().trim().max(120).nullable() }).strict(),
  z.object({ op: z.literal("people"), n: z.number().int().min(1).max(12) }).strict(),
  z.object({ op: z.literal("recipe"), name: z.string().trim().min(1).max(60), ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(30) }).strict(),
  z.object({ op: z.literal("recipeRemove"), name: z.string().trim().min(1).max(60) }).strict(),
]);
export const MAX_OPS = 60;
/** Samma strikta indata för ägaren och för familjemedlemmarna. */
export const opsBody = z.object({ ops: z.array(op).max(MAX_OPS) }).strict();
const body = opsBody;

/** Hämtar listorna. Kräver inloggning. */
export async function handleListsGet(req: Pick<ListsRequest, "userId">, db: PrismaClient = defaultDb): Promise<ListsResult> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  return { status: 200, json: { lists: await loadLists(db) } };
}

/** Sparar ändringar (flera åt gången, så att en kö från offline-läge kan skickas på en gång). Ordning: session, Origin, strikt indata. */
export async function handleListsPost(req: ListsRequest, db: PrismaClient = defaultDb): Promise<ListsResult> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Ogiltig begäran" } };
  const lists = await mutateLists(parsed.data.ops as Op[], db);
  // Hemskärmens cache av listorna är nu gammal.
  await db.snapshot.deleteMany({ where: { provider: "lists" } });
  await db.providerBackoff.deleteMany({ where: { provider: "lists" } });
  return { status: 200, json: { lists } };
}
