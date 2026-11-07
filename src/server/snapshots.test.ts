import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createPrisma } from "./db";
import { getHomeStates } from "./snapshots";
import type { Provider } from "./providers/types";

const db = createPrisma(process.env.DATABASE_URL);
const schema = z.object({ n: z.number() });
const T0 = new Date("2026-11-07T12:00:00.000Z");

function prov(id: Provider<unknown>["id"], fn: () => Promise<unknown>, ttl = 60) {
  let calls = 0;
  const p: Provider<unknown> = { id, ttlSeconds: ttl, schema, getSummary: async () => { calls++; return fn(); } };
  return { p, calls: () => calls };
}
const seed = (provider: string, payload: unknown, fetchedAt: Date) => db.snapshot.create({ data: { provider, payload: payload as never, fetchedAt } });

beforeEach(async () => { await db.snapshot.deleteMany(); await db.providerBackoff.deleteMany(); });

describe("getHomeStates", () => {
  it("fresh snapshot is served without calling provider", async () => {
    await seed("sonos", { n: 1 }, new Date(T0.getTime() - 10_000));
    const a = prov("sonos", async () => ({ n: 2 }));
    const s = await getHomeStates(T0, [a.p], db);
    expect(a.calls()).toBe(0);
    expect(s.sonos).toMatchObject({ status: "ok", data: { n: 1 } });
  });
  it("snapshot older than ttl triggers fetch and is stored", async () => {
    await seed("sonos", { n: 1 }, new Date(T0.getTime() - 120_000));
    const a = prov("sonos", async () => ({ n: 2 }));
    const s = await getHomeStates(T0, [a.p], db);
    expect(a.calls()).toBe(1);
    expect(s.sonos).toMatchObject({ status: "ok", data: { n: 2 } });
    const rows = await db.snapshot.findMany({ where: { provider: "sonos" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({ n: 2 });
  });
  it("exactly at ttl boundary refetches", async () => {
    await seed("sonos", { n: 1 }, new Date(T0.getTime() - 60_000));
    const a = prov("sonos", async () => ({ n: 2 }));
    await getHomeStates(T0, [a.p], db);
    expect(a.calls()).toBe(1);
  });
  it("future fetchedAt (clock skew) refetches", async () => {
    await seed("sonos", { n: 1 }, new Date(T0.getTime() + 3_600_000));
    const a = prov("sonos", async () => ({ n: 2 }));
    await getHomeStates(T0, [a.p], db);
    expect(a.calls()).toBe(1);
  });
  it("stored payload failing schema is ignored", async () => {
    await seed("sonos", { n: "fel" }, new Date(T0.getTime() - 5_000));
    const a = prov("sonos", async () => ({ n: 3 }));
    const s = await getHomeStates(T0, [a.p], db);
    expect(a.calls()).toBe(1);
    expect(s.sonos).toMatchObject({ status: "ok", data: { n: 3 } });
  });
  it("failing provider serves stale last data and does not affect others", async () => {
    await seed("sonos", { n: 1 }, new Date(T0.getTime() - 120_000));
    const bad = prov("sonos", async () => { throw new Error("nere"); });
    const good = prov("aeg", async () => ({ n: 9 }));
    const s = await getHomeStates(T0, [bad.p, good.p], db);
    expect(s.sonos).toMatchObject({ status: "stale", data: { n: 1 }, reason: "nere" });
    expect(s.aeg).toMatchObject({ status: "ok", data: { n: 9 } });
  });
  it("not_connected provider is not called and writes nothing", async () => {
    const a = prov("weather", async () => ({ n: 1 }));
    a.p.connected = false;
    const s = await getHomeStates(T0, [a.p], db);
    expect(a.calls()).toBe(0);
    expect(s.weather).toEqual({ status: "not_connected" });
    expect(await db.snapshot.count()).toBe(0);
  });
});

describe("backoff after failure", () => {
  it("a failing provider is not called again within 60 s", async () => {
    const bad = prov("sonos", async () => { throw new Error("nere"); });
    expect((await getHomeStates(T0, [bad.p], db)).sonos).toMatchObject({ status: "unavailable", reason: "nere" });
    const again = await getHomeStates(new Date(T0.getTime() + 30_000), [bad.p], db);
    expect(bad.calls()).toBe(1);
    expect(again.sonos).toMatchObject({ status: "unavailable", reason: "nere" });
  });
  it("during backoff stale data is still shown", async () => {
    await seed("sonos", { n: 1 }, new Date(T0.getTime() - 120_000));
    const bad = prov("sonos", async () => { throw new Error("nere"); });
    await getHomeStates(T0, [bad.p], db);
    const again = await getHomeStates(new Date(T0.getTime() + 10_000), [bad.p], db);
    expect(again.sonos).toMatchObject({ status: "stale", data: { n: 1 }, reason: "nere" });
    expect(bad.calls()).toBe(1);
  });
  it("after 60 s the provider is tried again, and success clears the backoff", async () => {
    let fail = true;
    const p = prov("sonos", async () => { if (fail) throw new Error("nere"); return { n: 5 }; });
    await getHomeStates(T0, [p.p], db);
    fail = false;
    const later = await getHomeStates(new Date(T0.getTime() + 60_000), [p.p], db);
    expect(p.calls()).toBe(2);
    expect(later.sonos).toMatchObject({ status: "ok", data: { n: 5 } });
    expect(await db.providerBackoff.count()).toBe(0);
  });
  it("one provider in backoff does not stop others", async () => {
    const bad = prov("sonos", async () => { throw new Error("nere"); });
    const good = prov("aeg", async () => ({ n: 2 }), 1);
    await getHomeStates(T0, [bad.p, good.p], db);
    const s = await getHomeStates(new Date(T0.getTime() + 5_000), [bad.p, good.p], db);
    expect(s.aeg).toMatchObject({ status: "ok" });
    expect(good.calls()).toBe(2);
  });
  it("not connected providers never get a backoff row", async () => {
    const a = prov("weather", async () => ({ n: 1 }));
    a.p.connected = false;
    await getHomeStates(T0, [a.p], db);
    expect(await db.providerBackoff.count()).toBe(0);
  });
});

describe("provider-specific backoff", () => {
  it("uses the provider's own wait after failure when set", async () => {
    const bad = prov("sonos", async () => { throw new Error("kvot"); });
    bad.p.failureBackoffMs = 600_000;
    await getHomeStates(T0, [bad.p], db);
    await getHomeStates(new Date(T0.getTime() + 300_000), [bad.p], db);
    expect(bad.calls()).toBe(1);
    await getHomeStates(new Date(T0.getTime() + 600_000), [bad.p], db);
    expect(bad.calls()).toBe(2);
  });
});
