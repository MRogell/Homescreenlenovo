import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { addDays } from "@/lib/dinner";
import { applyOps, CATEGORY_IDS, DEFAULT_PEOPLE, DEFAULT_PEOPLE_EVEN, EMPTY_LISTS, MAX_DINNERS, MAX_HISTORY, MAX_ITEMS, MAX_NOTES, MAX_PEOPLE, pruneHistory, type CategoryId, type Dinner, type HistoryEntry, type ListsState, type Op } from "@/lib/shopping";
import { localDate } from "../calendar/time";
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
    const by = str(i.by, 24);
    return id && name ? [{ id, name, qty: str(i.qty, 20), category: cat(i.category), checked: i.checked === true, at: num(i.at), checkedAt: i.checked === true ? num(i.checkedAt) : null, ...(i.skipped === true && i.checked !== true ? { skipped: true } : {}), ...(by ? { by } : {}) }] : [];
  }).slice(0, MAX_ITEMS);
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).flatMap((n) => {
    if (!isRec(n)) return [];
    const id = str(n.id, 64), text = str(n.text, 280);
    const by = str(n.by, 24);
    return id && text ? [{ id, text, at: num(n.at), ...(by ? { by } : {}) }] : [];
  }).slice(0, MAX_NOTES);
  const history: Record<string, HistoryEntry> = {};
  if (isRec(raw.history)) {
    for (const [k, h] of Object.entries(raw.history).slice(0, MAX_HISTORY)) {
      if (!isRec(h)) continue;
      const name = str(h.name, 60);
      if (name) history[k.slice(0, 60)] = { name, category: cat(h.category), count: Math.max(0, Math.floor(num(h.count))), lastAt: num(h.lastAt) };
    }
  }
  const dinners: Record<string, Dinner> = {};
  if (isRec(raw.dinners)) {
    for (const [d, v] of Object.entries(raw.dinners).slice(0, MAX_DINNERS)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isRec(v)) continue;
      const dish = str(v.dish, 60), by = str(v.by, 24);
      if (dish) dinners[d] = { dish, at: num(v.at), ...(by ? { by } : {}), ...(v.listed === true ? { listed: true } : {}) };
    }
  }
  const recipes: ListsState["recipes"] = {};
  if (isRec(raw.recipes)) {
    for (const [k, v] of Object.entries(raw.recipes).slice(0, 40)) {
      if (!isRec(v)) continue;
      const name = str(v.name, 60);
      const lines = (Array.isArray(v.ingredients) ? v.ingredients : []).flatMap((l) => (str(l, 60) ? [str(l, 60)!] : [])).slice(0, 30);
      if (name && lines.length > 0) recipes[k.slice(0, 60)] = { name, ingredients: lines };
    }
  }
  const habits: Record<string, string> = {};
  if (isRec(raw.habits)) for (const [k, v] of Object.entries(raw.habits)) { const dish = str(v, 60); if (/^[1-7]$/.test(k) && dish) habits[k] = dish; }
  const validPeople = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PEOPLE;
  // Äldre data hade ett enda antal: då gäller familjens grundinställning (6 udda veckor, 2 jämna).
  const people = validPeople(raw.peopleEven) && validPeople(raw.people) ? raw.people : DEFAULT_PEOPLE;
  const peopleEven = validPeople(raw.peopleEven) ? raw.peopleEven : DEFAULT_PEOPLE_EVEN;
  return { items, notes, history, dinners, recipes, habits, people, peopleEven };
}

export async function loadLists(db: PrismaClient = defaultDb): Promise<ListsState> {
  return normalizeLists((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}

/** Tillämpar operationer och sparar. Läs, ändra och skriv sker under ett lås, så att inget går förlorat när flera enheter sparar samtidigt. */
export async function mutateLists(ops: readonly Op[], db: PrismaClient = defaultDb, now: number = Date.now(), by?: string): Promise<ListsState> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    const current = normalizeLists((await tx.appSetting.findUnique({ where: { key: KEY } }))?.value);
    // Klientens klocka får inte ge tider i framtiden.
    // Vem som lade till något bestäms av servern (länken som användes), aldrig av det klienten skickar.
    const safe = ops.map((o) => {
      const t = "at" in o ? { ...o, at: Math.min(o.at, now) } : o;
      return t.op === "add" || t.op === "noteAdd" || t.op === "dinner" ? { ...t, by } : t;
    });
    const next = applyOps(current, safe);
    // Middagar äldre än två veckor behövs inte längre.
    const cutoff = addDays(localDate(new Date(now)), -14);
    const dinners = Object.fromEntries(Object.entries(next.dinners).filter(([d]) => d >= cutoff));
    const value = { ...next, dinners, history: pruneHistory(next.history) };
    await tx.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as never }, update: { value: value as never } });
    return value;
  });
}
