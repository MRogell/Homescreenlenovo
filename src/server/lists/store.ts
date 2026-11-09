import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { applyOps, CATEGORY_IDS, EMPTY_LISTS, MAX_HISTORY, MAX_ITEMS, MAX_NOTES, pruneHistory, type CategoryId, type HistoryEntry, type ListsState, type Op } from "@/lib/shopping";
import { db as defaultDb } from "../db";

const KEY = "lists";
/** Ett fast nummer för advisory lock: två enheter som sparar samtidigt köar i stället för att skriva över varandra. */
const LOCK = 727_001;

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const cat = (v: unknown): CategoryId => (CATEGORY_IDS.includes(v as CategoryId) ? (v as CategoryId) : "ovrigt");

/** Tolerant tolkning av det som ligger i databasen: trasiga poster hoppas över, aldrig ett fel. */
export function normalizeLists(raw: unknown): ListsState {
  if (!isRec(raw)) return EMPTY_LISTS;
  const items = (Array.isArray(raw.items) ? raw.items : []).flatMap((i) => {
    if (!isRec(i)) return [];
    const id = str(i.id, 64), name = str(i.name, 60);
    return id && name ? [{ id, name, qty: str(i.qty, 20), category: cat(i.category), checked: i.checked === true, at: num(i.at), checkedAt: i.checked === true ? num(i.checkedAt) : null }] : [];
  }).slice(0, MAX_ITEMS);
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).flatMap((n) => {
    if (!isRec(n)) return [];
    const id = str(n.id, 64), text = str(n.text, 280);
    return id && text ? [{ id, text, at: num(n.at) }] : [];
  }).slice(0, MAX_NOTES);
  const history: Record<string, HistoryEntry> = {};
  if (isRec(raw.history)) {
    for (const [k, h] of Object.entries(raw.history).slice(0, MAX_HISTORY)) {
      if (!isRec(h)) continue;
      const name = str(h.name, 60);
      if (name) history[k.slice(0, 60)] = { name, category: cat(h.category), count: Math.max(0, Math.floor(num(h.count))), lastAt: num(h.lastAt) };
    }
  }
  return { items, notes, history };
}

export async function loadLists(db: PrismaClient = defaultDb): Promise<ListsState> {
  return normalizeLists((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}

/** Tillämpar operationer och sparar. Läs, ändra och skriv sker under ett lås, så att inget går förlorat när flera enheter sparar samtidigt. */
export async function mutateLists(ops: readonly Op[], db: PrismaClient = defaultDb, now: number = Date.now()): Promise<ListsState> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    const current = normalizeLists((await tx.appSetting.findUnique({ where: { key: KEY } }))?.value);
    // Klientens klocka får inte ge tider i framtiden.
    const safe = ops.map((o) => ("at" in o ? { ...o, at: Math.min(o.at, now) } : o));
    const next = applyOps(current, safe);
    const value = { ...next, history: pruneHistory(next.history) };
    await tx.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as never }, update: { value: value as never } });
    return value;
  });
}
