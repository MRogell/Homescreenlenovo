import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { settingsPatchSchema, type AppSettings } from "@/lib/settings";
import { sameOrigin } from "./connect-flow";
import { db as defaultDb } from "./db";
import { applySettingsPatch } from "./settings";

export interface SettingsRequest {
  body: unknown;
  origin: string | null;
  host: string | null;
  /** Null när ingen giltig session finns. */
  userId: string | null;
}

export interface SettingsResult {
  status: number;
  json: { error?: string; settings?: AppSettings };
}

/** Sparar inställningar. Ordning: session, Origin, strikt indata, och först därefter något skrivs. */
export async function handleSettings(req: SettingsRequest, db: PrismaClient = defaultDb): Promise<SettingsResult> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Ogiltiga inställningar" } };
  const settings = await applySettingsPatch(parsed.data, db);
  // Ny väderplats: rensa vädrets cache så att nästa uppdatering hämtar den nya orten direkt.
  if (parsed.data.place !== undefined || parsed.data.reset) {
    await db.snapshot.deleteMany({ where: { provider: "weather" } });
    await db.providerBackoff.deleteMany({ where: { provider: "weather" } });
  }
  return { status: 200, json: { settings } };
}
