import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { sameOrigin } from "../connect-flow";
import { getAccessToken, getConnectionStatus } from "../connections";
import { db as defaultDb } from "../db";
import { describe, FREQUENCIES, metaKey, parseBring, rruleFor, SHARE_LEVELS, VISIBILITIES, type ActivityMeta } from "@/lib/activity";
import { loadFamily, saveMeta } from "./family-store";
import { createCaldavEvent, discoverCalendars } from "./caldav";
import { loadIcloud } from "./icloud-store";
import { getEnv } from "@/lib/env";
import { createGoogleEvent, deleteGoogleEvent, GoogleError, listGoogleCalendars } from "./google";
import { zonedToUtc } from "./time";

export interface EventsRequest { body: unknown; origin: string | null; host: string | null; userId: string | null }
export interface EventsResult { status: number; json: { error?: string; ok?: true } }
export interface EventsDeps { db?: PrismaClient; icloud?: () => Promise<import("./caldav").CaldavCredentials | null>; getToken?: () => Promise<string>; connected?: () => Promise<boolean>; fetchFn?: typeof fetch }

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const createBody = z.object({
  /** Kalenderns id i hemskärmen: "g:<Google-id>". Utan värde används huvudkalendern. */
  calendarId: z.string().min(3).max(200).optional(),
  title: z.string().trim().min(1).max(120),
  date,
  /** Sista dagen (heldag, eller över midnatt). Standard: samma dag. */
  endDate: date.optional(),
  allDay: z.boolean().default(false),
  start: time.optional(),
  end: time.optional(),
  location: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
  /** "Att ta med": en punkt per rad. */
  bring: z.string().max(1500).default(""),
  recurrence: z.enum(FREQUENCIES).default("NONE"),
  until: date.optional(),
  away: z.boolean().default(false),
  participants: z.array(z.string().min(1).max(40)).max(30).default([]),
  responsible: z.string().min(1).max(40).optional(),
  visibility: z.enum(VISIBILITIES).default("HOUSEHOLD"),
  shareLevel: z.enum(SHARE_LEVELS).default("EDIT"),
}).strict();
const deleteBody = z.object({ calendarId: z.string().min(3).max(200), eventId: z.string().min(1).max(200) }).strict();

const at = (d: string, h: number, mi: number) => zonedToUtc({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)), h, mi, s: 0 });

async function clearCache(db: PrismaClient) {
  await db.snapshot.deleteMany({ where: { provider: "calendar" } });
  await db.providerBackoff.deleteMany({ where: { provider: "calendar" } });
}

function basic(req: EventsRequest): EventsResult | null {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  return null;
}

async function gate(req: EventsRequest, deps: EventsDeps): Promise<{ result?: EventsResult; token?: string }> {
  const denied = basic(req);
  if (denied) return { result: denied };
  const connected = deps.connected ? await deps.connected() : (await getConnectionStatus("google")) === "ok";
  if (!connected) return { result: { status: 409, json: { error: "Anslut Google Kalender i Inställningar först." } } };
  try {
    return { token: await (deps.getToken ?? (() => getAccessToken("google")))() };
  } catch {
    return { result: { status: 409, json: { error: "Anslut Google Kalender igen i Inställningar." } } };
  }
}

function failed(e: unknown): EventsResult {
  if (e instanceof GoogleError && (e.status === 401 || e.status === 403)) return { status: 409, json: { error: "Google tillåter inte ändringen. Anslut Google Kalender igen i Inställningar och godkänn att ändra kalendern." } };
  return { status: 502, json: { error: "Google Kalender svarade inte. Försök igen." } };
}

/** Lägger till en händelse i en Google-kalender (som syns i Google och telefonens kalender) och rensar kalenderns cache. */
export async function handleCreateEvent(req: EventsRequest, deps: EventsDeps = {}): Promise<EventsResult> {
  const denied = basic(req);
  if (denied) return denied;
  const p = createBody.safeParse(req.body);
  if (!p.success) return { status: 400, json: { error: "Fyll i titel och datum." } };
  const b = p.data;
  const toIcloud = b.calendarId?.startsWith("i:") ?? false;
  const g = toIcloud ? {} : await gate(req, deps);
  if (g.result) return g.result;
  const endDate = b.endDate ?? b.date;
  if (endDate < b.date) return { status: 400, json: { error: "Slutdatum kan inte vara före startdatum." } };
  let start: string;
  let end: string;
  if (b.allDay) {
    start = b.date;
    end = endDate;
  } else {
    if (!b.start) return { status: 400, json: { error: "Välj starttid." } };
    const [sh, sm] = b.start.split(":").map(Number) as [number, number];
    const s = at(b.date, sh, sm);
    let e: Date;
    if (b.end) {
      const [eh, em] = b.end.split(":").map(Number) as [number, number];
      e = at(endDate, eh, em);
    } else e = new Date(s.getTime() + 3_600_000);
    if (e.getTime() <= s.getTime()) return { status: 400, json: { error: "Sluttiden måste vara efter starttiden." } };
    start = s.toISOString();
    end = e.toISOString();
  }
  if (b.responsible && !b.participants.includes(b.responsible)) return { status: 400, json: { error: "Den ansvarige måste vara deltagare." } };
  if (b.recurrence !== "NONE" && b.until && b.until < b.date) return { status: 400, json: { error: "Slutdatumet kan inte vara före startdatumet." } };
  const family = b.participants.length ? await loadFamily(deps.db) : [];
  const names = b.participants.map((id) => family.find((m) => m.id === id)?.name).filter((n): n is string => !!n);
  const responsibleName = family.find((m) => m.id === b.responsible)?.name;
  const bring = parseBring(b.bring);
  const extra = { location: b.location || undefined, description: describe(b.notes, bring, names, responsibleName) || undefined, rrule: rruleFor(b.recurrence, b.until, b.allDay) };
  const meta: ActivityMeta = { participants: b.participants, ...(b.responsible ? { responsible: b.responsible } : {}), bring, away: b.away, visibility: b.visibility, shareLevel: b.shareLevel };
  const keep = async (calendarId: string, id: string) => { if (id && (b.participants.length || bring.length || b.away || b.visibility !== "HOUSEHOLD" || b.shareLevel !== "EDIT")) await saveMeta(metaKey(calendarId, id), meta, deps.db); };
  if (toIcloud) {
    const creds = await (deps.icloud ?? (() => loadIcloud(getEnv().BETTER_AUTH_SECRET, deps.db)))();
    if (!creds) return { status: 409, json: { error: "Anslut iCloud i Inställningar först." } };
    try {
      const href = b.calendarId!.slice(2);
      if (!(await discoverCalendars(creds, deps.fetchFn)).some((c) => c.href === href && c.writable)) return { status: 400, json: { error: "Du kan inte lägga till i den kalendern." } };
      await keep(b.calendarId!, await createCaldavEvent(creds, href, { title: b.title, allDay: b.allDay, start, end, ...extra }, deps.fetchFn));
    } catch (e) {
      return e instanceof Error && e.name === "CaldavError" && (e as { kind?: string }).kind === "auth"
        ? { status: 409, json: { error: "iCloud nekade inloggningen. Anslut iCloud igen med ett nytt appspecifikt lösenord." } }
        : { status: 502, json: { error: "iCloud svarade inte. Försök igen." } };
    }
    await clearCache(deps.db ?? defaultDb);
    return { status: 200, json: { ok: true } };
  }
  try {
    const token = g.token!;
    let calId = b.calendarId?.startsWith("g:") ? b.calendarId.slice(2) : undefined;
    const cals = await listGoogleCalendars(token, deps.fetchFn);
    if (calId) {
      if (!cals.some((c) => c.id === calId && c.writable)) return { status: 400, json: { error: "Du kan inte lägga till i den kalendern." } };
    } else {
      calId = (cals.find((c) => c.writable) ?? cals[0])?.id;
      if (!calId) return { status: 409, json: { error: "Hittade ingen kalender att lägga till i." } };
    }
    await keep(`g:${calId}`, await createGoogleEvent(token, calId, { title: b.title, allDay: b.allDay, start, end, ...extra }, deps.fetchFn));
  } catch (e) {
    return failed(e);
  }
  await clearCache(deps.db ?? defaultDb);
  return { status: 200, json: { ok: true } };
}

export async function handleDeleteEvent(req: EventsRequest, deps: EventsDeps = {}): Promise<EventsResult> {
  const g = await gate(req, deps);
  if (g.result) return g.result;
  const p = deleteBody.safeParse(req.body);
  if (!p.success || !p.data.calendarId.startsWith("g:")) return { status: 400, json: { error: "Ogiltig begäran." } };
  try {
    await deleteGoogleEvent(g.token!, p.data.calendarId.slice(2), p.data.eventId, deps.fetchFn);
  } catch (e) {
    return failed(e);
  }
  await clearCache(deps.db ?? defaultDb);
  return { status: 200, json: { ok: true } };
}
