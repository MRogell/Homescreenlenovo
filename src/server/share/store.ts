import "server-only";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { db as defaultDb } from "../db";

/**
 * Familjemedlemmar som delar inköpslista och lappar. Var och en har en egen hemlig länk (/familj/<nyckel>) som ger tillgång
 * till de två sakerna och inget annat: inga bilkommandon, ingen musik, inga inställningar. Länken kan tas bort när som helst.
 * Nyckeln är 256 bitar slump och lagras krypterad (så att ägaren kan visa länken igen), aldrig i klartext.
 */
export const MAX_SHARES = 8;
export const MAX_NAME = 24;
const KEY = "shares";
const LOCK = 727_002;
/** Senast-använd uppdateras högst så ofta, så att varje hämtning inte blir en skrivning. */
const TOUCH_EVERY_MS = 10 * 60_000;

export class ShareError extends Error {
  constructor(public code: "limit" | "duplicate" | "name") {
    super(code === "limit" ? `Du kan dela med högst ${MAX_SHARES} personer.` : code === "duplicate" ? "Någon med det namnet finns redan." : "Skriv ett namn (högst 24 tecken).");
    this.name = "ShareError";
  }
}

interface Row { id: string; name: string; tokenEnc: string; createdAt: number; lastUsedAt: number | null }
export interface Share { id: string; name: string; token: string; createdAt: number; lastUsedAt: number | null }

function parseRows(v: unknown): Row[] {
  if (!Array.isArray(v)) return [];
  const out: Row[] = [];
  for (const r of v as unknown[]) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.name === "string" && typeof o.tokenEnc === "string" && typeof o.createdAt === "number") {
      out.push({ id: o.id, name: o.name, tokenEnc: o.tokenEnc, createdAt: o.createdAt, lastUsedAt: typeof o.lastUsedAt === "number" ? o.lastUsedAt : null });
    }
  }
  return out;
}

async function load(db: PrismaClient): Promise<Row[]> {
  return parseRows((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}
const save = (db: Pick<PrismaClient, "appSetting">, rows: Row[]) => db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: rows as never }, update: { value: rows as never } });

/** Läs, ändra och spara under ett lås, så att två samtidiga ändringar inte skriver över varandra. */
async function mutate<T>(db: PrismaClient, fn: (rows: Row[]) => { rows: Row[]; result: T }): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    const rows = parseRows((await tx.appSetting.findUnique({ where: { key: KEY } }))?.value);
    const out = fn(rows);
    await save(tx, out.rows);
    return out.result;
  });
}

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim();

/** Delningarna med nyckeln i klartext. Bara för servern och ägaren. */
export async function listShares(db: PrismaClient = defaultDb, secret: string): Promise<Share[]> {
  const out: Share[] = [];
  for (const r of await load(db)) {
    try {
      out.push({ id: r.id, name: r.name, token: decryptToken(r.tokenEnc, secret), createdAt: r.createdAt, lastUsedAt: r.lastUsedAt });
    } catch {
      // Går inte att dekryptera (ändrad hemlighet): hoppa över, resten fungerar.
    }
  }
  return out;
}

export async function createShare(name: string, db: PrismaClient = defaultDb, secret: string, now: number = Date.now()): Promise<Share> {
  const n = cleanName(name).slice(0, MAX_NAME);
  if (!n) throw new ShareError("name");
  const token = randomBytes(32).toString("base64url");
  const row: Row = { id: randomUUID().slice(0, 8), name: n, tokenEnc: encryptToken(token, secret), createdAt: now, lastUsedAt: null };
  await mutate(db, (rows) => {
    if (rows.length >= MAX_SHARES) throw new ShareError("limit");
    if (rows.some((r) => r.name.toLowerCase() === n.toLowerCase())) throw new ShareError("duplicate");
    return { rows: [...rows, row], result: null };
  });
  return { id: row.id, name: n, token, createdAt: now, lastUsedAt: null };
}

export async function removeShare(id: string, db: PrismaClient = defaultDb): Promise<void> {
  await mutate(db, (rows) => ({ rows: rows.filter((r) => r.id !== id), result: null }));
}

/** Vem hör nyckeln till? Jämförs i konstant tid mot alla (högst åtta), så att svarstiden inte avslöjar något. */
export async function findShare(token: string, db: PrismaClient = defaultDb, secret: string, now: number = Date.now()): Promise<{ id: string; name: string } | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const given = Buffer.from(token);
  let hit: Row | null = null;
  for (const r of await load(db)) {
    let t: string;
    try { t = decryptToken(r.tokenEnc, secret); } catch { continue; }
    const want = Buffer.from(t);
    if (want.length === given.length && timingSafeEqual(want, given)) hit = r;
  }
  if (!hit) return null;
  if (hit.lastUsedAt === null || now - hit.lastUsedAt > TOUCH_EVERY_MS) {
    const id = hit.id;
    await mutate(db, (rows) => ({ rows: rows.map((r) => (r.id === id ? { ...r, lastUsedAt: now } : r)), result: null })).catch(() => {});
  }
  return { id: hit.id, name: hit.name };
}
