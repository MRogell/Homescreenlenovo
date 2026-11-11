import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { MAX_TIMER_MIN, MAX_TIMERS, timerLabel, type TimerItem } from "@/lib/smart";
import { db as defaultDb } from "../db";
import { sameOrigin } from "../connect-flow";
import { dispatchEvents } from "../notify/push";
import { getSettings } from "../settings";

const KEY = "timers";
const LOCK = 727_004;
/** Färdiga timers ligger kvar så här länge (så att en skärm hinner visa "Klart"), sedan städas de bort. */
const KEEP_AFTER_MS = 15 * 60_000;

type Tx = Pick<PrismaClient, "appSetting" | "$executeRaw">;

function normalize(raw: unknown): TimerItem[] {
  const arr = raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
  const out: TimerItem[] = [];
  for (const v of arr) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.endsAt !== "number" || !Number.isFinite(o.endsAt)) continue;
    out.push({ id: o.id.slice(0, 40), label: typeof o.label === "string" ? o.label.slice(0, 30) : "", endsAt: o.endsAt, ...(o.notified === true ? { notified: true } : {}) });
  }
  return out.slice(0, MAX_TIMERS + 5);
}

export async function loadTimers(db: PrismaClient = defaultDb): Promise<TimerItem[]> {
  return normalize((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}

async function withLock<T>(db: PrismaClient, fn: (cur: TimerItem[], save: (t: TimerItem[]) => Promise<void>) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    const cur = normalize((await tx.appSetting.findUnique({ where: { key: KEY } }))?.value);
    return fn(cur, async (items) => { await tx.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: { items } as never }, update: { value: { items } as never } }); });
  });
}

/** Aktiva och nyligen färdiga timers, tidigast först. */
const tidy = (items: TimerItem[], now: number) => items.filter((t) => now - t.endsAt < KEEP_AFTER_MS).sort((a, b) => a.endsAt - b.endsAt);

export async function startTimer(minutes: number, label: string, now: Date, db: PrismaClient = defaultDb, id: string = crypto.randomUUID().replace(/-/g, "")): Promise<TimerItem[] | "full"> {
  return withLock(db, async (cur, save) => {
    const live = tidy(cur, now.getTime());
    if (live.filter((t) => t.endsAt > now.getTime()).length >= MAX_TIMERS) return "full" as const;
    const next = tidy([...live, { id, label: label.trim().slice(0, 30), endsAt: now.getTime() + Math.round(minutes * 60_000) }], now.getTime());
    await save(next);
    return next;
  });
}

export async function cancelTimer(id: string, now: Date, db: PrismaClient = defaultDb): Promise<TimerItem[]> {
  return withLock(db, async (cur, save) => {
    const next = tidy(cur.filter((t) => t.id !== id), now.getTime());
    await save(next);
    return next;
  });
}

/** Skickar notis för timers som gått av (en gång per timer) och städar gamla. Billigt: läser bara en rad. */
export async function timersTick(now: Date, deps: { db?: PrismaClient; notify?: typeof dispatchEvents } = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  try {
    const cur = await loadTimers(db);
    const due = cur.filter((t) => t.endsAt <= now.getTime() && !t.notified);
    if (due.length === 0 && cur.every((t) => now.getTime() - t.endsAt < KEEP_AFTER_MS)) return;
    if (!(await getSettings(db)).smart.timer.enabled && due.length === 0) return;
    const fired = await withLock(db, async (list, save) => {
      const ids = new Set(due.map((t) => t.id));
      const out = list.filter((t) => ids.has(t.id) && !t.notified);
      await save(tidy(list.map((t) => (ids.has(t.id) ? { ...t, notified: true } : t)), now.getTime()));
      return out;
    });
    if ((await getSettings(db)).smart.timer.enabled && fired.length > 0) {
      await (deps.notify ?? dispatchEvents)(fired.map((t) => ({ kind: "timer" as const, key: `timer:${t.id}`, title: `${timerLabel(t)} är klar`, body: "Tiden har gått ut." })), { db }, now);
    }
  } catch {
    // En extra funktion får aldrig stoppa anroparen.
  }
}

const body = z.union([
  z.object({ start: z.object({ minutes: z.number().min(1).max(MAX_TIMER_MIN), label: z.string().trim().max(30).optional() }).strict() }).strict(),
  z.object({ cancel: z.string().min(1).max(40) }).strict(),
]);

export interface TimersRequest { body?: unknown; origin: string | null; host: string | null; userId: string | null }
export interface TimersResult { status: number; json: { timers?: TimerItem[]; error?: string } }

/** Startar eller avbryter en timer. Ordning: session, Origin, strikt indata. */
export async function handleTimers(req: TimersRequest, deps: { db?: PrismaClient; now?: () => Date } = {}): Promise<TimersResult> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const p = body.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Ogiltig timer" } };
  const db = deps.db ?? defaultDb;
  const now = (deps.now ?? (() => new Date()))();
  if ("cancel" in p.data) return { status: 200, json: { timers: await cancelTimer(p.data.cancel, now, db) } };
  const r = await startTimer(p.data.start.minutes, p.data.start.label ?? "", now, db);
  return r === "full" ? { status: 409, json: { error: `Högst ${MAX_TIMERS} timers åt gången` } } : { status: 200, json: { timers: r } };
}
