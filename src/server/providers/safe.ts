import type { CardState, Provider } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

/** En tjänst som hänger sig får inte hålla kvar hela hemskärmen. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tjänsten svarade inte i tid")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function reasonOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return "Okänt fel";
}

/** Falskt när tjänsten är frånkopplad (statiskt eller via anslutningsstatus). */
export async function providerConnected(p: Provider<unknown>): Promise<boolean> {
  if (p.connected === false) return false;
  return p.isConnected ? p.isConnected() : true;
}

/**
 * Hämtar och validerar en tjänst. Kastar aldrig: fel blir `stale` (senaste kända data) eller `unavailable`,
 * så att en trasig tjänst aldrig tar ner övriga kort.
 */
export async function safeSummary<T>(p: Provider<T>, last?: { data: T; fetchedAt: string }): Promise<CardState<T>> {
  if (!(await providerConnected(p as Provider<unknown>))) return { status: "not_connected" };
  try {
    const parsed = p.schema.safeParse(await withTimeout(p.getSummary(), p.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    if (!parsed.success) throw new Error("Ogiltigt svar från tjänsten");
    return { status: "ok", data: parsed.data, fetchedAt: new Date().toISOString() };
  } catch (e) {
    const reason = reasonOf(e);
    return last ? { status: "stale", data: last.data, fetchedAt: last.fetchedAt, reason } : { status: "unavailable", reason };
  }
}
