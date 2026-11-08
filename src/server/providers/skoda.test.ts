import { describe, expect, it } from "vitest";
import { skodaSchema } from "./schemas";
import { safeSummary } from "./safe";
import { createSkodaProvider } from "./skoda";

const TOKEN = "t".repeat(40);
const CFG = { url: "https://bridge.example.com/", token: TOKEN };
const GOOD = { rangeKm: 312, levelPct: 78, levelKind: "battery", locked: true, charging: false, parked: "Storgatan 1", fetchedAt: "2026-11-07T20:00:00+00:00" };

function make(status: number, body: unknown, config: typeof CFG | null = CFG) {
  const calls: { url: string; auth: string }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>).Authorization! });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { p: createSkodaProvider({ getConfig: () => config, fetchFn }), calls };
}

describe("skoda provider", () => {
  it("calls the bridge with bearer token and a normalised url", async () => {
    const { p, calls } = make(200, GOOD);
    await p.getSummary();
    expect(calls).toEqual([{ url: "https://bridge.example.com/api/skoda", auth: `Bearer ${TOKEN}` }]);
  });
  it("valid bridge response becomes ok card data", async () => {
    const { p } = make(200, GOOD);
    const s = await safeSummary(p);
    expect(s).toMatchObject({ status: "ok", data: { rangeKm: 312, levelPct: 78, levelKind: "battery", locked: true, charging: false, parked: "Storgatan 1" } });
  });
  it("null fields are accepted (partial data, unknown lock state)", async () => {
    const { p } = make(200, { rangeKm: null, levelPct: null, levelKind: "fuel", locked: null, charging: false, parked: null });
    expect((await safeSummary(p)).status).toBe("ok");
  });
  it("percentages outside 0-100 and wrong types are rejected as unavailable", async () => {
    expect((await safeSummary(make(200, { ...GOOD, levelPct: 140 }).p)).status).toBe("unavailable");
    expect((await safeSummary(make(200, { ...GOOD, locked: "ja" }).p)).status).toBe("unavailable");
    expect((await safeSummary(make(200, { ...GOOD, levelKind: "vatten" }).p)).status).toBe("unavailable");
  });
  it("401 and 403 throw a bridge access error without leaking the token", async () => {
    for (const status of [401, 403]) {
      const err = await make(status, { error: "x" }).p.getSummary().catch((e) => e);
      expect(err.message).toMatch(/Škoda-bryggan/);
      expect(err.message).not.toContain(TOKEN);
    }
  });
  it("429, 500 and 502 throw", async () => {
    for (const status of [429, 500, 502]) await expect(make(status, { error: "x" }).p.getSummary()).rejects.toThrow(/Škoda/);
  });
  it("non-JSON 200 throws", async () => {
    await expect(make(200, "<html>nere</html>").p.getSummary()).rejects.toThrow();
  });
  it("network failure throws a neutral error", async () => {
    const p = createSkodaProvider({ getConfig: () => CFG, fetchFn: (async () => { throw new Error("ECONNREFUSED bridge.example.com"); }) as unknown as typeof fetch });
    const err = await p.getSummary().catch((e) => e);
    expect(err.message).toMatch(/Škoda/);
    expect(err.message).not.toContain("ECONNREFUSED");
  });
  it("without config: not connected, no request", async () => {
    const { p, calls } = make(200, GOOD, null);
    expect(await p.isConnected!()).toBe(false);
    expect(await safeSummary(p)).toEqual({ status: "not_connected" });
    expect(calls).toHaveLength(0);
  });
  it("with config isConnected is true; ttl is 5 min (2 min while charging) and timeout is long enough for a login", () => {
    const { p } = make(200, GOOD);
    expect(p.id).toBe("skoda");
    expect(p.ttlSeconds).toBe(300);
    expect(p.ttlFor?.({ ...GOOD, charging: true } as never)).toBe(120);
    expect(p.ttlFor?.({ ...GOOD, charging: false } as never)).toBe(300);
    expect(p.ttlFor?.({ ...GOOD, charging: false, climateOn: true } as never)).toBe(120);
    expect(p.ttlFor?.({ ...GOOD, charging: false, climateOn: false } as never)).toBe(300);
    expect(p.ttlFor?.({ ...GOOD, driving: true } as never)).toBe(120);
    expect(p.ttlFor?.({ ...GOOD, driving: false } as never)).toBe(300);
    const recent = new Date(Date.now() - 60_000).toISOString(), old = new Date(Date.now() - 11 * 60_000).toISOString();
    expect(p.ttlFor?.({ ...GOOD, climateOn: false, climateRequested: { action: "start", at: recent } } as never)).toBe(120);
    expect(p.ttlFor?.({ ...GOOD, climateOn: false, climateRequested: { action: "start", at: old } } as never)).toBe(300);
    expect(p.timeoutMs).toBeGreaterThanOrEqual(20_000);
  });
  it("schema accepts the bridge shape", () => expect(skodaSchema.safeParse(GOOD).success).toBe(true));
});
