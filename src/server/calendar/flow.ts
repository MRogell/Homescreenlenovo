import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { sameOrigin } from "../connect-flow";
import { db as defaultDb } from "../db";
import { CalendarFetchError, fetchIcs, type Lookup } from "./fetch";
import { IcsError, parseEvents } from "./ics";
import { CALENDAR_COLORS, CalendarStoreError, addCalendar, listCalendars, publicCalendars, removeCalendar, type PublicCalendar } from "./store";
import { dayWindow } from "./time";

export interface CalendarRequest { body: unknown; origin: string | null; host: string | null; userId: string | null }
export interface CalendarResult { status: number; json: { error?: string; calendars?: PublicCalendar[] } }
export interface CalendarFlowDeps { db?: PrismaClient; secret?: string; fetchFn?: typeof fetch; lookup?: Lookup }

const addBody = z.object({ name: z.string().trim().min(1).max(40), color: z.enum(CALENDAR_COLORS), url: z.string().min(1).max(2000) }).strict();
const removeBody = z.object({ id: z.string().min(1).max(40) }).strict();

/** Rensar kalenderns cache så att nästa uppdatering hämtar om direkt. */
async function clearCache(db: PrismaClient) {
  await db.snapshot.deleteMany({ where: { provider: "calendar" } });
  await db.providerBackoff.deleteMany({ where: { provider: "calendar" } });
}

function gate(req: CalendarRequest): CalendarResult | null {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  return null;
}

/** Lägger till en kalender. Länken prövas först (måste vara en riktig iCal-kalender), sparas krypterad och visas aldrig igen. */
export async function handleAddCalendar(req: CalendarRequest, deps: CalendarFlowDeps = {}): Promise<CalendarResult> {
  const denied = gate(req);
  if (denied) return denied;
  const parsed = addBody.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Fyll i namn, färg och länk." } };
  const db = deps.db ?? defaultDb;
  const secret = deps.secret ?? getEnv().BETTER_AUTH_SECRET;
  try {
    const text = await fetchIcs(parsed.data.url, { fetchFn: deps.fetchFn, lookup: deps.lookup });
    const w = dayWindow(new Date());
    parseEvents(text, { from: w.todayStart, to: w.end }); // kastar IcsError om det inte är en kalender
    await addCalendar(parsed.data, db, secret);
  } catch (e) {
    if (e instanceof IcsError) return { status: 400, json: { error: e.message } };
    if (e instanceof CalendarFetchError) return { status: e.code === "invalid_url" || e.code === "blocked" ? 400 : 502, json: { error: e.message } };
    if (e instanceof CalendarStoreError) return { status: 409, json: { error: e.message } };
    return { status: 500, json: { error: "Det gick inte att spara kalendern." } };
  }
  await clearCache(db);
  return { status: 200, json: { calendars: publicCalendars(await listCalendars(db, secret)) } };
}

export async function handleRemoveCalendar(req: CalendarRequest, deps: CalendarFlowDeps = {}): Promise<CalendarResult> {
  const denied = gate(req);
  if (denied) return denied;
  const parsed = removeBody.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Ogiltig begäran." } };
  const db = deps.db ?? defaultDb;
  await removeCalendar(parsed.data.id, db);
  await clearCache(db);
  return { status: 200, json: { calendars: publicCalendars(await listCalendars(db, deps.secret ?? getEnv().BETTER_AUTH_SECRET)) } };
}
