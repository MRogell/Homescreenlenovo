import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeSettings, type AppSettings, type SettingsPatch } from "@/lib/settings";
import { db as defaultDb } from "./db";

const APPEARANCE_KEYS = ["cards", "place", "night", "notify", "show"] as const;

/** Alla inställningar. Saknade eller trasiga värden blir grundvärden, aldrig ett fel (startsidan får aldrig gå sönder av dem). */
export async function getSettings(db: PrismaClient = defaultDb): Promise<AppSettings> {
  const rows = await db.appSetting.findMany();
  return normalizeSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

/** Sparar de delar som finns i patchen (en rad per del) och ger tillbaka alla inställningar. */
export async function applySettingsPatch(patch: SettingsPatch, db: PrismaClient = defaultDb): Promise<AppSettings> {
  const save = (key: string, value: unknown) => db.appSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
  if (patch.reset) {
    // Bara utseendet och notisvalen återställs. Kalendrar, push-nycklar och listor ligger i samma tabell och ska vara kvar.
    await db.appSetting.deleteMany({ where: { key: { in: [...APPEARANCE_KEYS] } } });
    return getSettings(db);
  }
  const ops = [];
  if (patch.cards) ops.push(save("cards", patch.cards));
  if (patch.night) ops.push(save("night", patch.night));
  if (patch.notify) ops.push(save("notify", { ...(await getSettings(db)).notify, ...patch.notify }));
  if (patch.show) ops.push(save("show", patch.show));
  if (patch.place === null) ops.push(db.appSetting.deleteMany({ where: { key: "place" } }));
  else if (patch.place) ops.push(save("place", patch.place));
  await db.$transaction(ops);
  return getSettings(db);
}
