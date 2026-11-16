import { isNight, type AppSettings } from "./settings";

/** Under natten hämtar skärmen sällan (databasen får vila och gratiskvoten räcker längre). */
export const QUIET_POLL_MS = 10 * 60_000;

/** Nattläget om det är på, annars klockan 00:00–05:00 (enhetens tid). */
export function isQuietHours(now: Date, night: AppSettings["night"]): boolean {
  return night.enabled ? isNight(now, night) : now.getHours() < 5;
}
