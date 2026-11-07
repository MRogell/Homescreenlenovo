import type { CardState, Provider } from "./types";

function reasonOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return "Okänt fel";
}

/**
 * Hämtar och validerar en tjänst. Kastar aldrig: fel blir `stale` (senaste kända data) eller `unavailable`,
 * så att en trasig tjänst aldrig tar ner övriga kort.
 */
export async function safeSummary<T>(p: Provider<T>, last?: { data: T; fetchedAt: string }): Promise<CardState<T>> {
  if (p.connected === false) return { status: "not_connected" };
  try {
    const parsed = p.schema.safeParse(await p.getSummary());
    if (!parsed.success) throw new Error("Ogiltigt svar från tjänsten");
    return { status: "ok", data: parsed.data, fetchedAt: new Date().toISOString() };
  } catch (e) {
    const reason = reasonOf(e);
    return last ? { status: "stale", data: last.data, fetchedAt: last.fetchedAt, reason } : { status: "unavailable", reason };
  }
}
