import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { LEAD_OPTIONS, type DepartureView } from "@/lib/departure";
import { sameOrigin } from "../connect-flow";
import { db as defaultDb } from "../db";
import { getHomeStates, type HomeStates } from "../snapshots";
import { saveDeparture, setSkipToday } from "./store";
import { getDepartureView } from "./tick";

export interface DepartureRequest { body?: unknown; origin: string | null; host: string | null; userId: string | null }
export interface DepartureResult { status: number; json: { error?: string; departure?: DepartureView } }
export interface DepartureDeps { db?: PrismaClient; states?: () => Promise<HomeStates>; now?: () => Date }

const settings = z.object({
  enabled: z.boolean(),
  /** Veckodag (1–7) till avresetid. Minst en dag. */
  times: z.record(z.string().regex(/^[1-7]$/), z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(3).refine((a) => new Set(a).size === a.length)).refine((t) => Object.keys(t).length >= 1),
  leadMin: z.number().refine((n) => (LEAD_OPTIONS as readonly number[]).includes(n)),
  belowC: z.number().int().min(-20).max(25),
  targetC: z.number().min(16).max(29.5).refine((t) => Number.isInteger(t * 2)),
}).strict();
const body = z.union([z.object({ settings }).strict(), z.object({ skip: z.boolean() }).strict()]);

/** Sparar inställningarna för förvärm eller hoppar över idag. Ordning: session, Origin, strikt indata. */
export async function handleDeparture(req: DepartureRequest, deps: DepartureDeps = {}): Promise<DepartureResult> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const p = body.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Ogiltiga inställningar" } };
  const db = deps.db ?? defaultDb;
  const now = (deps.now ?? (() => new Date()))();
  if ("skip" in p.data) await setSkipToday(p.data.skip, now, db);
  else await saveDeparture(p.data.settings, db);
  const states = await (deps.states ?? (() => getHomeStates(now)))();
  return { status: 200, json: { departure: await getDepartureView(states, now, db) } };
}
