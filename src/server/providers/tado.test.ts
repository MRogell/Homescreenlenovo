import { describe, expect, it } from "vitest";
import { safeSummary } from "./safe";
import { createTadoProvider, type TadoCache } from "./tado";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const ME = { homes: [{ id: 4711, name: "Hemma" }] };
const ZONES = [
  { id: 1, name: "Vardagsrum", type: "HEATING" },
  { id: 2, name: "Barnrum", type: "HEATING" },
  { id: 3, name: "Varmvatten", type: "HOT_WATER" },
  { id: 4, name: "Kök", type: "HEATING" },
];
const STATES = { zoneStates: {
  "1": { setting: { power: "ON", temperature: { celsius: 21 } }, activityDataPoints: { heatingPower: { percentage: 35 } }, sensorDataPoints: { insideTemperature: { celsius: 23.46 }, humidity: { percentage: 41.2 } } },
  "2": { setting: { power: "OFF" }, activityDataPoints: { heatingPower: { percentage: 0 } }, sensorDataPoints: { insideTemperature: { celsius: 20 }, humidity: { percentage: 45 } } },
  "4": { setting: { power: "ON", temperature: { celsius: 22 } } },
} };

function setup(routes: Record<string, { status: number; body?: unknown }>, cache: TadoCache | null = null) {
  const calls: string[] = [];
  let saved: TadoCache | null = cache;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const path = url.replace("https://my.tado.com/api/v2", "");
    calls.push(`${path} ${(init.headers as Record<string, string>).Authorization}`);
    const r = routes[path] ?? { status: 404 };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  const p = createTadoProvider({
    getToken: async () => "TOK",
    fetchFn,
    nowMs: () => NOW,
    loadCache: async () => saved,
    saveCache: async (c) => { saved = c; },
  });
  return { p, calls, saved: () => saved };
}
const ALL = { "/me": { status: 200, body: ME }, "/homes/4711/zones": { status: 200, body: ZONES }, "/homes/4711/zoneStates": { status: 200, body: STATES } };

describe("tado provider", () => {
  it("first run reads home and rooms, caches them and maps the states", async () => {
    const t = setup(ALL);
    const d = await t.p.getSummary();
    expect(t.calls).toEqual(["/me Bearer TOK", "/homes/4711/zones Bearer TOK", "/homes/4711/zoneStates Bearer TOK"]);
    expect(d).toEqual({ rooms: [
      { name: "Barnrum", tempC: 20, humidity: 45, targetC: null, heating: false },
      { name: "Kök", tempC: null, humidity: null, targetC: 22, heating: false },
      { name: "Vardagsrum", tempC: 23.5, humidity: 41, targetC: 21, heating: true },
    ] });
    expect(t.saved()).toEqual({ homeId: 4711, zones: [{ id: 1, name: "Vardagsrum" }, { id: 2, name: "Barnrum" }, { id: 4, name: "Kök" }], fetchedAt: NOW });
  });
  it("with a fresh cache only one request is made (Tado allows 100 per day)", async () => {
    const t = setup(ALL, { homeId: 4711, zones: [{ id: 1, name: "Vardagsrum" }], fetchedAt: NOW - 3_600_000 });
    await t.p.getSummary();
    expect(t.calls).toEqual(["/homes/4711/zoneStates Bearer TOK"]);
  });
  it("a cache older than a day is refreshed", async () => {
    const t = setup(ALL, { homeId: 4711, zones: [{ id: 1, name: "Vardagsrum" }], fetchedAt: NOW - 25 * 3_600_000 });
    await t.p.getSummary();
    expect(t.calls).toHaveLength(3);
  });
  it("401 and 429 give clear errors", async () => {
    await expect(setup({ "/me": { status: 401 } }).p.getSummary()).rejects.toThrow(/anslut igen/);
    await expect(setup({ ...ALL, "/homes/4711/zoneStates": { status: 429 } }).p.getSummary()).rejects.toThrow(/kvot/);
  });
  it("no homes or odd responses throw instead of crashing", async () => {
    await expect(setup({ "/me": { status: 200, body: { homes: [] } } }).p.getSummary()).rejects.toThrow(/hem/);
    await expect(setup({ ...ALL, "/homes/4711/zones": { status: 200, body: { nej: 1 } } }).p.getSummary()).rejects.toThrow();
    const t = setup({ ...ALL, "/homes/4711/zoneStates": { status: 200, body: { zoneStates: null } } });
    expect((await t.p.getSummary()).rooms.every((r) => r.tempC === null)).toBe(true);
  });
  it("passes the card schema; ttl 20 min and 10 min wait after errors", async () => {
    const t = setup(ALL);
    expect((await safeSummary(t.p)).status).toBe("ok");
    expect(t.p.id).toBe("tado");
    expect(t.p.ttlSeconds).toBe(1200);
    expect(t.p.failureBackoffMs).toBe(600_000);
  });
});
