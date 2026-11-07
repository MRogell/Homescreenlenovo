import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { OAuthError, refreshTokens, type OAuthConfig, type TokenSet } from "@/lib/oauth";
import { db as defaultDb } from "./db";
import { refreshTadoTokens, TADO_DEFAULT_CLIENT_ID } from "@/lib/tado-auth";
import { refreshAegTokens } from "@/lib/aeg-auth";
import { getOAuthConfig, type OAuthProviderId } from "./oauth-providers";

/** Tjänster med lagrade tokens: OAuth (Sonos, Spotify) och Tado (enhetskodsflöde). */
export type TokenProviderId = OAuthProviderId | "tado" | "aeg";

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
  /** Förnyar tokens; standard väljs per tjänst (Tado: publik klient, övriga: OAuth-konfigurationen). */
  refresh?: (refreshToken: string, nowMs: number) => Promise<TokenSet>;
}

const SKEW_MS = 60_000;

type ConnDb = Pick<PrismaClient, "connection">;

export async function saveTokens(userId: string, provider: TokenProviderId, tokens: TokenSet, db: ConnDb = defaultDb): Promise<void> {
  const tokenEnc = encryptToken(JSON.stringify(tokens), getEnv().BETTER_AUTH_SECRET);
  await db.connection.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, tokenEnc, status: "ok", lastSyncAt: new Date() },
    update: { tokenEnc, status: "ok", lastError: null, lastSyncAt: new Date() },
  });
}

export async function getConnectionStatus(provider: TokenProviderId, db: PrismaClient = defaultDb): Promise<"ok" | "reauth" | "none" | "pending"> {
  const row = await db.connection.findFirst({ where: { provider }, select: { status: true } });
  if (!row) return "none";
  if (row.status === "pending") return "pending"; // inloggning påbörjad men inte godkänd
  return row.status === "ok" ? "ok" : "reauth";
}

async function markReauth(db: PrismaClient, id: string, reason: string) {
  await db.connection.update({ where: { id }, data: { status: "reauth", lastError: reason } });
}

export async function getAccessToken(provider: TokenProviderId, deps: ConnDeps = {}): Promise<string> {
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

  let refresh = deps.refresh;
  if (!refresh) {
    if (provider === "aeg") {
      refresh = (rt, n) => refreshAegTokens(rt, deps.fetchFn, n);
    } else if (provider === "tado") {
      const clientId = getEnv().TADO_CLIENT_ID ?? TADO_DEFAULT_CLIENT_ID;
      refresh = (rt, n) => refreshTadoTokens(clientId, rt, deps.fetchFn, n);
    } else {
      const config = deps.config ?? getOAuthConfig(provider);
      if (!config) throw new Error("Saknar konfiguration");
      refresh = (rt, n) => refreshTokens(config, rt, deps.fetchFn, n);
    }
  }
  try {
    return await refreshLocked(db, provider, refresh, now);
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
async function refreshLocked(db: PrismaClient, provider: TokenProviderId, refresh: (refreshToken: string, nowMs: number) => Promise<TokenSet>, now: number): Promise<string> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`oauth-refresh:${provider}`}))`;
      const row = await tx.connection.findFirst({ where: { provider } });
      if (!row || row.status !== "ok") throw new ReauthRequired();
      const current = JSON.parse(decryptToken(row.tokenEnc, getEnv().BETTER_AUTH_SECRET)) as TokenSet;
      if (current.expiresAt - now > SKEW_MS) return current.accessToken;
      const fresh = await refresh(current.refreshToken, now);
      await saveTokens(row.userId, provider, fresh, tx);
      return fresh.accessToken;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}

/** Kopplar från och raderar tjänstens cachade data. */
export async function deleteConnection(provider: TokenProviderId, db: PrismaClient = defaultDb): Promise<void> {
  await db.connection.deleteMany({ where: { provider } });
  await db.snapshot.deleteMany({ where: { provider } });
}
