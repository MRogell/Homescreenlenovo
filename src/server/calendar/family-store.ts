import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_HANDOVER, MAX_MEMBERS, MEMBER_KINDS, type ActivityMeta, type FamilyMember, type Handover } from "@/lib/activity";
import { db as defaultDb } from "../db";

const member = z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(30), kind: z.enum(MEMBER_KINDS) }).strict();
const handover = z.object({ weekday: z.number().int().min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).strict();
export const familyBody = z.object({ members: z.array(member.partial({ id: true })).max(MAX_MEMBERS), handover: handover.optional() }).strict();

/** Sparat värde: lista (äldre) eller { members, handover }. */
async function loadRaw(db: PrismaClient): Promise<{ members: FamilyMember[]; handover: Handover }> {
  const v = (await db.appSetting.findUnique({ where: { key: "family" } }))?.value as unknown;
  const list = Array.isArray(v) ? v : (v as { members?: unknown } | null)?.members;
  const m = z.array(member).safeParse(list);
  const h = handover.safeParse((v as { handover?: unknown } | null)?.handover);
  return { members: m.success ? m.data : [], handover: h.success ? h.data : DEFAULT_HANDOVER };
}

export async function loadFamily(db: PrismaClient = defaultDb): Promise<FamilyMember[]> {
  return (await loadRaw(db)).members;
}
export async function loadFamilyAll(db: PrismaClient = defaultDb) {
  return loadRaw(db);
}

export async function saveFamily(list: { id?: string; name: string; kind: FamilyMember["kind"] }[], h?: Handover, db: PrismaClient = defaultDb): Promise<{ members: FamilyMember[]; handover: Handover }> {
  const seen = new Set<string>();
  const members: FamilyMember[] = [];
  for (const m of list) {
    const key = m.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({ id: m.id || randomUUID().slice(0, 8), name: m.name.trim(), kind: m.kind });
  }
  const handoverValue = h ?? (await loadRaw(db)).handover;
  const value = { members, handover: handoverValue };
  await db.appSetting.upsert({ where: { key: "family" }, create: { key: "family", value: value as never }, update: { value: value as never } });
  return value;
}

const MAX_META = 400;
export async function loadMeta(db: PrismaClient = defaultDb): Promise<Record<string, ActivityMeta>> {
  const v = (await db.appSetting.findUnique({ where: { key: "activityMeta" } }))?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as Record<string, ActivityMeta>) : {};
}

export async function saveMeta(key: string, meta: ActivityMeta, db: PrismaClient = defaultDb): Promise<void> {
  const all = await loadMeta(db);
  delete all[key];
  all[key] = meta;
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_META))) delete all[k]; // de äldsta först
  await db.appSetting.upsert({ where: { key: "activityMeta" }, create: { key: "activityMeta", value: all as never }, update: { value: all as never } });
}
