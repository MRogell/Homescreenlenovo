import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { pollDeviceToken, startDeviceAuth, TADO_DEFAULT_CLIENT_ID, type DeviceAuth } from "@/lib/tado-auth";
import { sameOrigin } from "./connect-flow";
import { saveTokens } from "./connections";
import { db as defaultDb } from "./db";

export interface TadoRequest {
  origin: string | null;
  host: string | null;
  userId: string | null;
}

export interface TadoDeps {
  db?: PrismaClient;
  fetchFn?: typeof fetch;
  nowMs?: number;
}

type Result = { status: number; json?: Record<string, unknown> };

function guard(req: TadoRequest): Result | null {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  return null;
}

const clientId = () => getEnv().TADO_CLIENT_ID ?? TADO_DEFAULT_CLIENT_ID;

/** Startar Tados enhetskodsinloggning. Den väntande koden sparas krypterat tills användaren godkänt. */
export async function handleTadoStart(req: TadoRequest, deps: TadoDeps = {}): Promise<Result> {
  const denied = guard(req);
  if (denied) return denied;
  const db = deps.db ?? defaultDb;
  let auth: DeviceAuth;
  try {
    auth = await startDeviceAuth(clientId(), deps.fetchFn, deps.nowMs);
  } catch {
    return { status: 502, json: { error: "Tado svarade inte. Försök igen om en stund." } };
  }
  const tokenEnc = encryptToken(JSON.stringify(auth), getEnv().BETTER_AUTH_SECRET);
  await db.connection.upsert({
    where: { userId_provider: { userId: req.userId!, provider: "tado" } },
    create: { userId: req.userId!, provider: "tado", tokenEnc, status: "pending" },
    update: { tokenEnc, status: "pending", lastError: null },
  });
  return { status: 200, json: { userCode: auth.userCode, verifyUrl: auth.verifyUrl, expiresAt: auth.expiresAt, intervalS: auth.intervalS } };
}

/** Frågar Tado en gång om inloggningen är godkänd. Sidan anropar detta med Tados intervall. */
export async function handleTadoPoll(req: TadoRequest, deps: TadoDeps = {}): Promise<Result> {
  const denied = guard(req);
  if (denied) return denied;
  const db = deps.db ?? defaultDb;
  const now = deps.nowMs ?? Date.now();
  const row = await db.connection.findFirst({ where: { provider: "tado", status: "pending" } });
  if (!row) return { status: 409, json: { error: "Ingen pågående Tado-inloggning." } };
  const drop = () => db.connection.delete({ where: { id: row.id } });

  let pending: DeviceAuth;
  try {
    pending = JSON.parse(decryptToken(row.tokenEnc, getEnv().BETTER_AUTH_SECRET)) as DeviceAuth;
  } catch {
    await drop();
    return { status: 200, json: { status: "failed" } };
  }
  if (now >= pending.expiresAt) {
    await drop();
    return { status: 200, json: { status: "expired" } };
  }
  const result = await pollDeviceToken(clientId(), pending.deviceCode, deps.fetchFn, now);
  if (result.status === "ok") {
    await saveTokens(row.userId, "tado", result.tokens, db);
    return { status: 200, json: { status: "ok" } };
  }
  if (result.status === "pending") return { status: 200, json: { status: "pending" } };
  await drop();
  return { status: 200, json: { status: result.status } };
}
