import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getHomeStates } from "./snapshots";
import { forgetSnapshot, setSnapshotMemory } from "./snapshot-memory";
import type { Provider } from "./providers/types";

function fakeDb() {
  const counts = { find: 0, create: 0 };
  let row: { id: string; provider: string; payload: unknown; fetchedAt: Date } | null = null;
  const db = {
    snapshot: {
      findFirst: async () => { counts.find++; return row; },
      create: async ({ data }: { data: { provider: string; payload: unknown; fetchedAt: Date } }) => { counts.create++; row = { id: "1", ...data }; return row; },
      deleteMany: async () => ({}),
    },
    providerBackoff: { findUnique: async () => null, deleteMany: async () => ({}), upsert: async () => ({}) },
  } as never;
  return { db, counts };
}
const make = (calls: { n: number }): Provider<{ v: number }> => ({ id: "weather", ttlSeconds: 60, schema: z.object({ v: z.number() }), isConnected: async () => true, getSummary: async () => ({ v: ++calls.n }) }) as never;

afterEach(() => setSnapshotMemory(false));

describe("snapshot i minnet", () => {
  it("färska svar läses från minnet och inte ur databasen", async () => {
    setSnapshotMemory(true);
    const { db, counts } = fakeDb();
    const calls = { n: 0 };
    const now = new Date("2026-11-20T10:00:00Z");
    const a = await getHomeStates(now, [make(calls) as never], db);
    expect(a.weather).toMatchObject({ status: "ok", data: { v: 1 } });
    const findsAfterFirst = counts.find;
    const b = await getHomeStates(new Date(now.getTime() + 30_000), [make(calls) as never], db);
    expect(b.weather).toMatchObject({ status: "ok", data: { v: 1 } });
    expect(counts.find).toBe(findsAfterFirst); // ingen ny databasläsning
    expect(calls.n).toBe(1);
  });
  it("hämtas om när giltigheten gått ut eller minnet rensats", async () => {
    setSnapshotMemory(true);
    const { db } = fakeDb();
    const calls = { n: 0 };
    const now = new Date("2026-11-20T10:00:00Z");
    await getHomeStates(now, [make(calls) as never], db);
    await getHomeStates(new Date(now.getTime() + 61_000), [make(calls) as never], db);
    expect(calls.n).toBe(2);
    forgetSnapshot("weather");
    await getHomeStates(new Date(now.getTime() + 62_000), [make(calls) as never], db);
    expect(calls.n).toBe(2); // rensat minne men färsk rad i databasen: ingen ny hämtning från tjänsten
  });
});
