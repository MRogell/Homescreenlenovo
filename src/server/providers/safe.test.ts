import { describe, expect, it } from "vitest";
import { z } from "zod";
import { safeSummary } from "./safe";
import type { Provider } from "./types";

const schema = z.object({ n: z.number() });
const make = (fn: () => Promise<unknown>): Provider<{ n: number }> => ({ id: "sonos", ttlSeconds: 10, schema, getSummary: fn as never });

describe("safeSummary", () => {
  it("returns ok with data", async () => {
    const s = await safeSummary(make(async () => ({ n: 1 })));
    expect(s).toMatchObject({ status: "ok", data: { n: 1 } });
  });
  it("returns stale with last data when provider throws", async () => {
    const last = { data: { n: 7 }, fetchedAt: "2026-11-07T10:00:00.000Z" };
    const s = await safeSummary(make(async () => { throw new Error("nere"); }), last);
    expect(s).toMatchObject({ status: "stale", data: { n: 7 }, fetchedAt: last.fetchedAt, reason: "nere" });
  });
  it("returns unavailable when throws and no last", async () => {
    const s = await safeSummary(make(async () => { throw new Error("nere"); }));
    expect(s).toEqual({ status: "unavailable", reason: "nere" });
  });
  it("handles non-Error throw (string, null)", async () => {
    expect((await safeSummary(make(async () => { throw "fel"; }))).status).toBe("unavailable");
    expect((await safeSummary(make(async () => { throw null; }))).status).toBe("unavailable");
  });
  it("invalid data from provider is treated as failure", async () => {
    const s = await safeSummary(make(async () => ({ n: "inte ett tal" })));
    expect(s.status).toBe("unavailable");
  });
  it("not_connected is returned as-is", async () => {
    const p = { ...make(async () => ({ n: 1 })), connected: false };
    expect(await safeSummary(p)).toEqual({ status: "not_connected" });
  });
});

describe("safeSummary isConnected", () => {
  it("isConnected false gives not_connected without calling provider", async () => {
    let calls = 0;
    const p: Provider<{ n: number }> = { id: "sonos", ttlSeconds: 10, schema, isConnected: async () => false, getSummary: async () => { calls++; return { n: 1 }; } };
    expect(await safeSummary(p)).toEqual({ status: "not_connected" });
    expect(calls).toBe(0);
  });
  it("isConnected true proceeds", async () => {
    const p: Provider<{ n: number }> = { id: "sonos", ttlSeconds: 10, schema, isConnected: async () => true, getSummary: async () => ({ n: 1 }) };
    expect((await safeSummary(p)).status).toBe("ok");
  });
});

describe("safeSummary timeout", () => {
  const hang = () => new Promise<{ n: number }>(() => {});
  it("a provider that never answers becomes unavailable after its timeout", async () => {
    const p: Provider<{ n: number }> = { id: "sonos", ttlSeconds: 10, timeoutMs: 30, schema, getSummary: hang };
    const s = await safeSummary(p);
    expect(s).toMatchObject({ status: "unavailable" });
    expect((s as { reason: string }).reason).toMatch(/i tid/);
  });
  it("a timeout serves stale last data when it exists", async () => {
    const p: Provider<{ n: number }> = { id: "sonos", ttlSeconds: 10, timeoutMs: 30, schema, getSummary: hang };
    expect(await safeSummary(p, { data: { n: 4 }, fetchedAt: "2026-11-07T10:00:00.000Z" })).toMatchObject({ status: "stale", data: { n: 4 } });
  });
  it("a fast provider is unaffected by the timeout", async () => {
    const p: Provider<{ n: number }> = { id: "sonos", ttlSeconds: 10, timeoutMs: 1000, schema, getSummary: async () => ({ n: 1 }) };
    expect((await safeSummary(p)).status).toBe("ok");
  });
});
