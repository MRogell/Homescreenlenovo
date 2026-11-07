import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { OAuthError, refreshTokens, type OAuthConfig, type TokenSet } from "@/lib/oauth";
import { db as defaultDb } from "./db";
import { getOAuthConfig, type OAuthProviderId } from "./oauth-providers";

/** Anslutningen saknas, är återkallad eller går inte att läsa: användaren måste ansluta igen. */
export class ReauthRequired extends Error {
  constructor(message = "Anslut igen") {
    super(message);
    this.name = "ReauthRequired";
  }
}

export interface ConnDeps {
  db?: PrismaClient;
  fetchFn?: typeof fetch;
  nowMs?: number;
  config?: OAuthConfig;
}

const SKEW_MS = 60_000;

type ConnDb = Pick<PrismaClient, "connection">;

export async function saveTokens(userId: string, provider: OAuthProviderId, tokens: TokenSet, db: ConnDb = defaultDb): Promise<void> {
  const tokenEnc = encryptToken(JSON.stringify(tokens), getEnv().BETTER_AUTH_SECRET);
  await db.connection.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, tokenEnc, status: "ok", lastSyncAt: new Date() },
    update: { tokenEnc, status: "ok", lastError: null, lastSyncAt: new Date() },
  });
}

export async function getConnectionStatus(provider: OAuthProviderId, db: PrismaClient = defaultDb): Promise<"ok" | "reauth" | "none"> {
  const row = await db.connection.findFirst({ where: { provider }, select: { status: true } });
  if (!row) return "none";
  return row.status === "ok" ? "ok" : "reauth";
}

async function markReauth(db: PrismaClient, id: string, reason: string) {
  await db.connection.update({ where: { id }, data: { status: "reauth", lastError: reason } });
}

export async function getAccessToken(provider: OAuthProviderId, deps: ConnDeps = {}): Promise<string> {
  const db = deps.db ?? defaultDb;
  const now = deps.nowMs ?? Date.now();
  const row = await db.connection.findFirst({ where: { provider } });
  if (!row || row.status !== "ok") throw new ReauthRequired();

  let tokens: TokenSet;
  try {
    tokens = JSON.parse(decryptToken(row.tokenEnc, getEnv().BETTER_AUTH_SECRET)) as TokenSet;
  } catch {
    await markReauth(db, row.id, "Tokens går inte att läsa (hemligheten har ändrats?)");
    throw new ReauthRequired();
  }
  if (tokens.expiresAt - now > SKEW_MS) return tokens.accessToken;

  const config = deps.config ?? getOAuthConfig(provider);
  if (!config) throw new Error("Saknar konfiguration");
  try {
    return await refreshLocked(db, provider, config, deps.fetchFn, now);
  } catch (e) {
    // Bara ett uttryckligt "återkallad" kräver ny anslutning. Nätverks- och serverfel är tillfälliga.
    if (e instanceof OAuthError && e.code === "invalid_grant") {
      await markReauth(db, row.id, "Anslutningen har återkallats");
      throw new ReauthRequired();
    }
    throw e;
  }
}

/**
 * Förnyar under ett Postgres-lås (en förnyelse åt gången per tjänst, över alla serverinstanser: på Vercel körs flera).
 * Refresh-token kan vara engångs, så den som kommer sist ska läsa de nya tokens i stället för att förnya igen.
 */
async function refreshLocked(db: PrismaClient, provider: OAuthProviderId, config: OAuthConfig, fetchFn: typeof fetch | undefined, now: number): Promise<string> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`oauth-refresh:${provider}`}))`;
      const row = await tx.connection.findFirst({ where: { provider } });
      if (!row || row.status !== "ok") throw new ReauthRequired();
      const current = JSON.parse(decryptToken(row.tokenEnc, getEnv().BETTER_AUTH_SECRET)) as TokenSet;
      if (current.expiresAt - now > SKEW_MS) return current.accessToken;
      const fresh = await refreshTokens(config, current.refreshToken, fetchFn, now);
      await saveTokens(row.userId, provider, fresh, tx);
      return fresh.accessToken;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}

/** Kopplar från och raderar tjänstens cachade data. */
export async function deleteConnection(provider: OAuthProviderId, db: PrismaClient = defaultDb): Promise<void> {
  await db.connection.deleteMany({ where: { provider } });
  await db.snapshot.deleteMany({ where: { provider } });
}
