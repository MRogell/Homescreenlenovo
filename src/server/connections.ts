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
// En förnyelse åt gången per tjänst (och process). Refresh-token kan vara engångs hos vissa tjänster.
const inflight = new Map<string, Promise<TokenSet>>();

export async function saveTokens(userId: string, provider: OAuthProviderId, tokens: TokenSet, db: PrismaClient = defaultDb): Promise<void> {
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
  let pending = inflight.get(provider);
  if (!pending) {
    pending = refreshTokens(config, tokens.refreshToken, deps.fetchFn, now)
      .then(async (fresh) => {
        await saveTokens(row.userId, provider, fresh, db);
        return fresh;
      })
      .finally(() => inflight.delete(provider));
    inflight.set(provider, pending);
  }
  try {
    return (await pending).accessToken;
  } catch (e) {
    // Bara ett uttryckligt "återkallad" kräver ny anslutning. Nätverks- och serverfel är tillfälliga.
    if (e instanceof OAuthError && e.code === "invalid_grant") {
      await markReauth(db, row.id, "Anslutningen har återkallats");
      throw new ReauthRequired();
    }
    throw e;
  }
}

/** Kopplar från och raderar tjänstens cachade data. */
export async function deleteConnection(provider: OAuthProviderId, db: PrismaClient = defaultDb): Promise<void> {
  await db.connection.deleteMany({ where: { provider } });
  await db.snapshot.deleteMany({ where: { provider } });
}
