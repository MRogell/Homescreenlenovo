import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { departureView, type ColdLead, type DepartureCtx, type DepartureView } from "@/lib/departure";
import { startSkodaClimateNow, type ControlFlowDeps } from "../control-flow";
import { db as defaultDb } from "../db";
import { getSettings } from "../settings";
import { dispatchEvents } from "../notify/push";
import type { HomeStates } from "../snapshots";
import { localClock } from "../calendar/time";
import { claimDeparture, finishRun, loadDeparture, loadTimerAt, TIMER_ACTIVE_MS } from "./store";

export interface TickDeps extends ControlFlowDeps {
  db?: PrismaClient;
  /** För test: ersätter startkommandot. Ger null vid lyckat, annars en felkod. */
  start?: (temperatureC: number) => Promise<string | null>;
  notify?: typeof dispatchEvents;
}

/** Utetemperatur (från vädret) och bilens klimatläge ur hemskärmens data. Okänt blir null. */
export function contextOf(states: HomeStates, coldLead?: ColdLead | null): DepartureCtx {
  const w = states.weather, c = states.skoda;
  const wd = w && (w.status === "ok" || w.status === "stale") ? (w.data as { tempC?: unknown; hourly?: unknown }) : null;
  const tempC = wd && typeof wd.tempC === "number" ? wd.tempC : null;
  const hourly = Array.isArray(wd?.hourly) ? (wd!.hourly as { time?: unknown; tempC?: unknown }[]).flatMap((h) => (typeof h.time === "string" && typeof h.tempC === "number" ? [{ time: h.time, tempC: h.tempC }] : [])) : [];
  const climateOn = c && (c.status === "ok" || c.status === "stale") ? ((c.data as { climateOn?: boolean | null }).climateOn ?? null) : null;
  return { tempC, climateOn, hourly, coldLead: coldLead ?? null };
}

/** Det som visas på kortet. */
export async function getDepartureView(states: HomeStates, now: Date, db: PrismaClient = defaultDb): Promise<DepartureView> {
  const cold = (await getSettings(db)).smart.coldLead;
  const view = departureView(await loadDeparture(db), now, contextOf(states, cold));
  const lastAt = await loadTimerAt(db);
  return { ...view, timer: { lastAt, active: lastAt !== null && now.getTime() - lastAt < TIMER_ACTIVE_MS } };
}

/**
 * Körs varje gång hemskärmen hämtar data. Är det dags att förvärma startas klimatet (en gång: se claimDeparture),
 * och telefonen får en notis. Fel stoppar aldrig anroparen.
 */
export async function preheatTick(states: HomeStates, now: Date, deps: TickDeps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  try {
    const cold = (await getSettings(db)).smart.coldLead;
    const claim = await claimDeparture(now, contextOf(states, cold), db);
    if (claim.action !== "start") return;
    const s = claim.settings;
    const code = deps.start ? await deps.start(s.targetC) : await startSkodaClimateNow(s.targetC, { ...deps, db });
    await finishRun(code === null, now, db);
    if (code === null) {
      await (deps.notify ?? dispatchEvents)([{ kind: "preheat", key: `preheat:${claim.settings.last?.date}:${claim.settings.last?.slot ?? 0}`, title: "Bilen förvärms", body: `Klimatet startade, klart ca ${s.times[String(localClock(now).weekday)]?.[s.last?.slot ?? 0] ?? ""} (${String(s.targetC).replace(".", ",")} °C).` }], { db }, now);
    }
  } catch {
    // Förvärmningen är en extra; hemskärmen går före.
  }
}
