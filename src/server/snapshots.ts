import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { db as defaultDb } from "./db";
import { PROVIDERS } from "./providers";
import { providerConnected, safeSummary } from "./providers/safe";
import type { CardState, Provider, ProviderId } from "./providers/types";

export type HomeStates = Partial<Record<ProviderId, CardState<unknown>>>;

async function loadLast(db: PrismaClient, p: Provider<unknown>): Promise<{ data: unknown; fetchedAt: Date } | undefined> {
  const row = await db.snapshot.findFirst({ where: { provider: p.id }, orderBy: { fetchedAt: "desc" } });
  if (!row) return undefined;
  const parsed = p.schema.safeParse(row.payload);
  // Utgånget schema (ändrad payload) räknas som att ingen snapshot finns.
  return parsed.success ? { data: parsed.data, fetchedAt: row.fetchedAt } : undefined;
}

async function resolveOne(p: Provider<unknown>, now: Date, db: PrismaClient): Promise<CardState<unknown>> {
  if (!(await providerConnected(p))) return { status: "not_connected" };
  const last = await loadLast(db, p);
  if (last) {
    const ageMs = now.getTime() - last.fetchedAt.getTime();
    // Färsk endast om 0 <= ålder < ttl. Framtida tidsstämpel (klockskev) och exakt ttl hämtas om.
    if (ageMs >= 0 && ageMs < p.ttlSeconds * 1000) return { status: "ok", data: last.data, fetchedAt: last.fetchedAt.toISOString() };
  }
  const state = await safeSummary(p, last ? { data: last.data, fetchedAt: last.fetchedAt.toISOString() } : undefined);
  if (state.status === "ok") {
    const created = await db.snapshot.create({ data: { provider: p.id, payload: state.data as never, fetchedAt: now } });
    await db.snapshot.deleteMany({ where: { provider: p.id, id: { not: created.id } } });
    return { ...state, fetchedAt: now.toISOString() };
  }
  return state;
}

/** Läser färsk cache eller hämtar från tjänsten. Varje tjänst hanteras isolerat. */
export async function getHomeStates(now: Date = new Date(), providers: Provider<unknown>[] = PROVIDERS, db: PrismaClient = defaultDb): Promise<HomeStates> {
  const entries = await Promise.all(
    providers.map(async (p) => {
      try {
        return [p.id, await resolveOne(p, now, db)] as const;
      } catch (e) {
        // Databasfel för en tjänst får inte fälla övriga.
        return [p.id, { status: "unavailable", reason: e instanceof Error ? e.message : "Okänt fel" } as CardState<unknown>] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
