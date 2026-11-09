import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeSettings, type AppSettings, type SettingsPatch } from "@/lib/settings";
import { db as defaultDb } from "./db";

/** Alla inställningar. Saknade eller trasiga värden blir grundvärden, aldrig ett fel (startsidan får aldrig gå sönder av dem). */
export async function getSettings(db: PrismaClient = defaultDb): Promise<AppSettings> {
  const rows = await db.appSetting.findMany();
  return normalizeSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

/** Sparar de delar som finns i patchen (en rad per del) och ger tillbaka alla inställningar. */
export async function applySettingsPatch(patch: SettingsPatch, db: PrismaClient = defaultDb): Promise<AppSettings> {
  const save = (key: string, value: unknown) => db.appSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
  if (patch.reset) {
    await db.appSetting.deleteMany();
    return getSettings(db);
  }
  const ops = [];
  if (patch.cards) ops.push(save("cards", patch.cards));
  if (patch.night) ops.push(save("night", patch.night));
  if (patch.notify) ops.push(save("notify", patch.notify));
  if (patch.place === null) ops.push(db.appSetting.deleteMany({ where: { key: "place" } }));
  else if (patch.place) ops.push(save("place", patch.place));
  await db.$transaction(ops);
  return getSettings(db);
}
