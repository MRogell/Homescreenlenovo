import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { decideChargeReminder, type CarBattery } from "@/lib/smart";
import { localClock } from "../calendar/time";
import { db as defaultDb } from "../db";
import { dispatchEvents } from "../notify/push";
import { skodaSchema } from "../providers/schemas";
import type { HomeStates } from "../snapshots";
import { getSettings } from "../settings";

const KEY = "chargeReminder";

export interface SmartDeps { db?: PrismaClient; notify?: typeof dispatchEvents }

export function carOf(states: Pick<HomeStates, "skoda">): CarBattery | null {
  const c = states.skoda;
  if (!c || (c.status !== "ok" && c.status !== "stale")) return null;
  const p = skodaSchema.safeParse(c.data);
  return p.success ? { levelKind: p.data.levelKind, levelPct: p.data.levelPct, charging: p.data.charging } : null;
}

/** Är det dags att titta på bilen? Billigt: bara inställningarna och dagens markering, inga anrop till bilen. */
export async function chargeReminderDue(now: Date, db: PrismaClient = defaultDb): Promise<boolean> {
  const s = (await getSettings(db)).smart.chargeReminder;
  const checked = ((await db.appSetting.findUnique({ where: { key: KEY } }))?.value as { date?: string } | null)?.date ?? null;
  const d = decideChargeReminder(s, now, { levelKind: "battery", levelPct: 0, charging: false }, checked);
  return d.kind === "notify";
}

/**
 * Laddpåminnelse: en gång per dygn efter inställd tid. Dagens kontroll markeras först när bilens värde är känt,
 * så att en kort driftstörning inte gör att dagen hoppas över. Notisen har en nyckel per dygn och skickas därför högst en gång.
 */
export async function chargeReminderTick(states: Pick<HomeStates, "skoda">, now: Date, deps: SmartDeps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  try {
    const s = (await getSettings(db)).smart.chargeReminder;
    const date = localClock(now).date;
    const checked = ((await db.appSetting.findUnique({ where: { key: KEY } }))?.value as { date?: string } | null)?.date ?? null;
    const d = decideChargeReminder(s, now, carOf(states), checked);
    if (d.kind === "ok" || d.kind === "notify") {
      await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: { date } as never }, update: { value: { date } as never } });
    }
    if (d.kind === "notify") {
      await (deps.notify ?? dispatchEvents)([{ kind: "chargeReminder", key: `charge_reminder:${date}`, title: "Ladda bilen", body: d.body }], { db }, now);
    }
  } catch {
    // En extra funktion får aldrig stoppa anroparen.
  }
}
