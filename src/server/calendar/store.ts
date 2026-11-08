import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { db as defaultDb } from "../db";
import { normalizeCalendarUrl } from "./fetch";

export const CALENDAR_COLORS = ["blue", "green", "yellow", "red", "purple"] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];
export const MAX_CALENDARS = 6;

export interface PublicCalendar { id: string; name: string; color: CalendarColor; host: string }
export interface Calendar extends PublicCalendar { url: string }

export class CalendarStoreError extends Error {
  constructor(public code: "limit" | "duplicate") {
    super(code === "limit" ? "Du kan koppla högst sex kalendrar." : "Den kalendern är redan kopplad.");
    this.name = "CalendarStoreError";
  }
}

interface Row { id: string; name: string; color: CalendarColor; host: string; urlEnc: string }
const KEY = "calendars";
const isColor = (c: unknown): c is CalendarColor => CALENDAR_COLORS.includes(c as CalendarColor);

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Row => !!r && typeof r === "object" && typeof (r as Row).id === "string" && typeof (r as Row).name === "string" && isColor((r as Row).color) && typeof (r as Row).host === "string" && typeof (r as Row).urlEnc === "string");
}

async function load(db: PrismaClient): Promise<Row[]> {
  return rows((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
}
const save = (db: PrismaClient, list: Row[]) => db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: list as never }, update: { value: list as never } });

/** Kalendrarna med adressen i klartext. Bara för servern: adressen är en hemlighet och lämnar aldrig servern. */
export async function listCalendars(db: PrismaClient = defaultDb, secret: string): Promise<Calendar[]> {
  const out: Calendar[] = [];
  for (const r of await load(db)) {
    try {
      out.push({ id: r.id, name: r.name, color: r.color, host: r.host, url: decryptToken(r.urlEnc, secret) });
    } catch {
      // Går inte att dekryptera (t.ex. ändrad hemlighet): hoppa över, resten fungerar.
    }
  }
  return out;
}

/** Det webbläsaren får se: namn, färg och vilken sajt kalendern kommer från, aldrig adressen. */
export const publicCalendars = (list: readonly Calendar[]): PublicCalendar[] => list.map(({ id, name, color, host }) => ({ id, name, color, host }));

export async function addCalendar(input: { name: string; color: CalendarColor; url: string }, db: PrismaClient = defaultDb, secret: string): Promise<PublicCalendar> {
  const url = normalizeCalendarUrl(input.url);
  const existing = await listCalendars(db, secret);
  if ((await load(db)).length >= MAX_CALENDARS) throw new CalendarStoreError("limit");
  if (existing.some((c) => c.url === url)) throw new CalendarStoreError("duplicate");
  const row: Row = { id: randomUUID().slice(0, 8), name: input.name.trim(), color: input.color, host: new URL(url).hostname, urlEnc: encryptToken(url, secret) };
  await save(db, [...(await load(db)), row]);
  return { id: row.id, name: row.name, color: row.color, host: row.host };
}

export async function removeCalendar(id: string, db: PrismaClient = defaultDb): Promise<void> {
  const list = await load(db);
  const next = list.filter((r) => r.id !== id);
  if (next.length !== list.length) await save(db, next);
}
