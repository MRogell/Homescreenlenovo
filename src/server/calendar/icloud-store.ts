import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { db as defaultDb } from "../db";
import { forgetSnapshot } from "../snapshot-memory";
import type { CaldavCredentials } from "./caldav";

const KEY = "icloud";

/** Apple-ID och appspecifikt lösenord, krypterade. Lösenordet lämnar aldrig servern. */
export async function saveIcloud(c: CaldavCredentials, secret: string, db: PrismaClient = defaultDb): Promise<void> {
  const value = { enc: encryptToken(JSON.stringify(c), secret) };
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  forgetSnapshot("calendar");
  await db.snapshot.deleteMany({ where: { provider: "calendar" } });
}

export async function loadIcloud(secret: string, db: PrismaClient = defaultDb): Promise<CaldavCredentials | null> {
  const v = (await db.appSetting.findUnique({ where: { key: KEY } }))?.value as { enc?: string } | null | undefined;
  if (!v?.enc) return null;
  try {
    const c = JSON.parse(decryptToken(v.enc, secret)) as CaldavCredentials;
    return c.user && c.password ? c : null;
  } catch {
    return null;
  }
}

export async function removeIcloud(db: PrismaClient = defaultDb): Promise<void> {
  forgetSnapshot("calendar");
  await db.appSetting.deleteMany({ where: { key: KEY } });
  await db.snapshot.deleteMany({ where: { provider: "calendar" } });
}
