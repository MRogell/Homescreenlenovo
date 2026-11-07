import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { AEG_API, aegTokenSet } from "@/lib/aeg-auth";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { sameOrigin } from "./connect-flow";
import { saveTokens } from "./connections";
import { db as defaultDb } from "./db";

export interface AegSetupRequest {
  body: unknown;
  origin: string | null;
  host: string | null;
  userId: string | null;
}

// Inklistrade värden: trimmas, får inte innehålla blanksteg.
const secret = (max: number) => z.string().trim().min(8).max(max).regex(/^\S+$/);
const bodySchema = z.object({ apiKey: secret(512), accessToken: secret(4096), refreshToken: secret(4096) }).strict();

/** API-nyckeln (krypterad på anslutningen). Null om den saknas eller inte går att läsa. */
export async function getAegApiKey(db: PrismaClient = defaultDb): Promise<string | null> {
  const row = await db.connection.findFirst({ where: { provider: "aeg", status: "ok" }, select: { settings: true } });
  const enc = (row?.settings as { apiKeyEnc?: unknown } | null)?.apiKeyEnc;
  if (typeof enc !== "string") return null;
  try {
    return decryptToken(enc, getEnv().BETTER_AUTH_SECRET);
  } catch {
    return null;
  }
}

/** Sparar AEG-uppgifter från Electrolux utvecklarportal, men först efter att de fungerat mot API:t. */
export async function handleAegSetup(req: AegSetupRequest, deps: { db?: PrismaClient; fetchFn?: typeof fetch; nowMs?: number } = {}): Promise<{ status: number; json?: { error: string } }> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Fyll i API-nyckel, access-token och refresh-token (utan mellanslag)." } };
  const { apiKey, accessToken, refreshToken } = parsed.data;

  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(`${AEG_API}/appliances`, { headers: { Authorization: `Bearer ${accessToken}`, "x-api-key": apiKey }, cache: "no-store" });
  } catch {
    return { status: 502, json: { error: "Electrolux svarade inte. Försök igen om en stund." } };
  }
  if (res.status === 401 || res.status === 403) return { status: 400, json: { error: "Electrolux godkände inte nyckeln eller token. Kontrollera att du kopierat rätt, eller skapa nya i portalen." } };
  if (!res.ok) return { status: 502, json: { error: "Electrolux svarade inte. Försök igen om en stund." } };

  const db = deps.db ?? defaultDb;
  const now = deps.nowMs ?? Date.now();
  await saveTokens(req.userId, "aeg", aegTokenSet(accessToken, refreshToken, now), db);
  await db.connection.update({
    where: { userId_provider: { userId: req.userId, provider: "aeg" } },
    data: { settings: { apiKeyEnc: encryptToken(apiKey, getEnv().BETTER_AUTH_SECRET) } },
  });
  return { status: 204 };
}
