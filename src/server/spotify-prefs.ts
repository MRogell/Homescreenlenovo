import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { sameOrigin } from "./connect-flow";
import { db as defaultDb } from "./db";

export interface DefaultDevice {
  id: string;
  name: string;
}

const deviceSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9]{1,128}$/), name: z.string().trim().min(1).max(100) });

/** Spotifys standardenhet (sparad på anslutningen). Ogiltigt sparat värde räknas som inget. */
export async function getSpotifyDefaultDevice(db: PrismaClient = defaultDb): Promise<DefaultDevice | null> {
  const row = await db.connection.findFirst({ where: { provider: "spotify" }, select: { settings: true } });
  const parsed = deviceSchema.safeParse((row?.settings as { defaultDevice?: unknown } | null)?.defaultDevice);
  return parsed.success ? parsed.data : null;
}

export interface SetDefaultRequest {
  body: unknown;
  origin: string | null;
  host: string | null;
  userId: string | null;
}

const bodySchema = z.union([
  z.object({ deviceId: z.string().regex(/^[A-Za-z0-9]{1,128}$/), name: z.string().trim().min(1).max(100) }).strict(),
  z.object({ clear: z.literal(true) }).strict(),
]);

/** Sätter eller tar bort standardenheten. Ordning: session, Origin, indata, anslutning. */
export async function handleSetDefault(req: SetDefaultRequest, deps: { db?: PrismaClient } = {}): Promise<{ status: number; json?: { error: string; code: string } }> {
  const db = deps.db ?? defaultDb;
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad", code: "unauthenticated" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung", code: "origin" } };
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Ogiltig enhet", code: "invalid" } };
  const row = await db.connection.findFirst({ where: { provider: "spotify" }, select: { id: true, settings: true } });
  if (!row) return { status: 409, json: { error: "Anslut Spotify först.", code: "not_connected" } };

  const current = row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? (row.settings as Record<string, unknown>) : {};
  const { defaultDevice: _old, ...rest } = current;
  void _old;
  const settings = "clear" in parsed.data ? rest : { ...rest, defaultDevice: { id: parsed.data.deviceId, name: parsed.data.name } };
  await db.connection.update({ where: { id: row.id }, data: { settings: settings as never } });
  return { status: 204 };
}
