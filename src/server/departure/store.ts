import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { decide, normalizeDeparture, type Decision, type DeparturePatch, type DepartureSettings, type LastRun } from "@/lib/departure";
import { localClock } from "../calendar/time";
import { db as defaultDb } from "../db";

const KEY = "departure";
/** Advisory lock: två skärmar som hämtar samtidigt ska inte kunna starta bilen två gånger. */
const LOCK = 727_003;

export async function loadDeparture(db: PrismaClient = defaultDb): Promise<DepartureSettings> {
  return normalizeDeparture((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}

type Tx = Pick<PrismaClient, "appSetting" | "$executeRaw">;
async function withLock<T>(db: PrismaClient, fn: (cur: DepartureSettings, save: (s: DepartureSettings) => Promise<void>) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
    const cur = normalizeDeparture((await tx.appSetting.findUnique({ where: { key: KEY } }))?.value);
    return fn(cur, async (s) => { await tx.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as never }, update: { value: s as never } }); });
  });
}

/** Sparar inställningarna. Ändrar man något avbryts inte dagens körning, men en ny tid eller ändrade dagar gäller direkt. */
export async function saveDeparture(patch: DeparturePatch, db: PrismaClient = defaultDb): Promise<DepartureSettings> {
  return withLock(db, async (cur, save) => {
    const next = normalizeDeparture({ ...cur, ...patch });
    await save(next);
    return next;
  });
}

/** Hoppa över (eller ångra att man hoppar över) dagens förvärmning. */
export async function setSkipToday(skip: boolean, now: Date, db: PrismaClient = defaultDb): Promise<DepartureSettings> {
  return withLock(db, async (cur, save) => {
    const today = localClock(now).date;
    const next = { ...cur, skipDate: skip ? today : cur.skipDate === today ? null : cur.skipDate };
    await save(next);
    return next;
  });
}

export type Claim = { action: "start"; settings: DepartureSettings } | { action: "other"; decision: Decision };

/**
 * Avgör under lås vad som ska hända, och för en start eller ett överhopp skrivs det direkt, så att inte en andra skärm som hämtar
 * samtidigt också startar. Att starta markeras som "pågår" tills anroparen rapporterar resultatet med `finishRun`.
 */
export async function claimDeparture(now: Date, ctx: { tempC: number | null; climateOn: boolean | null }, db: PrismaClient = defaultDb): Promise<Claim> {
  return withLock(db, async (cur, save) => {
    const d = decide(cur, now, ctx);
    const date = localClock(now).date;
    if (d.kind === "start") {
      const attempts = (cur.last && cur.last.date === date ? cur.last.attempts : 0) + 1;
      const last: LastRun = { date, status: "starting", attempts, at: now.getTime(), tempC: ctx.tempC };
      await save({ ...cur, last });
      return { action: "start" as const, settings: { ...cur, last } };
    }
    if (d.kind === "skip") {
      const attempts = cur.last && cur.last.date === date ? cur.last.attempts : 0;
      await save({ ...cur, last: { date, status: d.reason === "warm" ? "skipped_warm" : "skipped_on", attempts, at: now.getTime(), tempC: ctx.tempC } });
    }
    return { action: "other" as const, decision: d };
  });
}

/** Skriver resultatet av en start. */
export async function finishRun(ok: boolean, now: Date, db: PrismaClient = defaultDb): Promise<void> {
  await withLock(db, async (cur, save) => {
    const date = localClock(now).date;
    if (!cur.last || cur.last.date !== date) return;
    await save({ ...cur, last: { ...cur.last, status: ok ? "started" : "failed", at: now.getTime() } });
  });
}
