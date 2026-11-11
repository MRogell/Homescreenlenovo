import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { currentSlot } from "@/lib/departure";
import { db as defaultDb } from "../db";
import { PROVIDERS } from "../providers";
import { getHomeStates, type HomeStates } from "../snapshots";
import { loadDeparture, TIMER_KEY } from "./store";
import { chargeReminderDue, chargeReminderTick } from "../smart/charge";
import { timersTick } from "../smart/timers";
import { preheatTick, type TickDeps } from "./tick";

export interface CronDeps extends TickDeps {
  states?: (now: Date) => Promise<HomeStates>;
  now?: () => Date;
}
export interface CronResult { status: number; json: { ok?: boolean; action?: string; error?: string } }

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Anropas av en extern timer (till exempel cron-job.org, varje minut) med `Authorization: Bearer <CRON_SECRET>`.
 * Då behöver ingen skärm vara öppen: är det dags att förvärma hämtas väder och bilstatus och klimatet startas.
 * Utanför ett förvärmfönster görs inget dyrt (inga anrop till Škoda eller vädret).
 */
export async function handlePreheatCron(req: { authorization: string | null }, secret: string | undefined, deps: CronDeps = {}): Promise<CronResult> {
  if (!secret || secret.length < 16) return { status: 503, json: { error: "CRON_SECRET saknas" } };
  const given = req.authorization?.startsWith("Bearer ") ? req.authorization.slice(7) : "";
  if (!given || !same(given, secret)) return { status: 401, json: { error: "Ej behörig" } };
  const db = deps.db ?? defaultDb;
  const now = (deps.now ?? (() => new Date()))();
  await db.appSetting.upsert({ where: { key: TIMER_KEY }, create: { key: TIMER_KEY, value: { at: now.getTime() } as never }, update: { value: { at: now.getTime() } as never } });
  // Timers är billiga (en rad i databasen) och görs alltid.
  await timersTick(now, { db, notify: deps.notify });
  const departureDue = currentSlot(await loadDeparture(db), now, { tempC: null, climateOn: null }).decision.kind === "start";
  const chargeDue = await chargeReminderDue(now, db);
  if (!departureDue && !chargeDue) return { status: 200, json: { ok: true, action: "none" } };
  const ids = new Set(["weather", "skoda"]);
  const states = deps.states ? await deps.states(now) : await getHomeStates(now, PROVIDERS.filter((p) => ids.has(p.id)), db);
  if (departureDue) await preheatTick(states, now, { ...deps, db });
  if (chargeDue) await chargeReminderTick(states, now, { db, notify: deps.notify });
  return { status: 200, json: { ok: true, action: "checked" } };
}
