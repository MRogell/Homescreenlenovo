import { describe, expect, it } from "vitest";
import { safeSummary } from "./safe";
import { createAegProvider, type AegCache } from "./aeg";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const APPLIANCES = [{ applianceId: "OV1", applianceName: "Ugn", applianceType: "OV" }, { applianceId: "DW1", applianceName: "Diskmaskin", applianceType: "DW" }];
const state = (reported: Record<string, unknown>, connectionState = "Connected") => ({ applianceId: "DW1", connectionState, status: "enabled", properties: { reported } });

function setup(routes: Record<string, { status: number; body?: unknown }>, cache: AegCache | null = null) {
  const calls: string[] = [];
  let saved = cache;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    calls.push(`${url.replace("https://api.developer.electrolux.one/api/v1", "")} ${h.Authorization} ${h["x-api-key"]}`);
    const r = routes[url.replace("https://api.developer.electrolux.one/api/v1", "")] ?? { status: 404 };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  const p = createAegProvider({ getToken: async () => "TOK", getApiKey: async () => "KEY", fetchFn, nowMs: () => NOW, loadCache: async () => saved, saveCache: async (c) => { saved = c; } });
  return { p, calls, saved: () => saved };
}

describe("aeg provider", () => {
  it("finds the dishwasher, caches it and maps a running cycle", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/state": { status: 200, body: state({ applianceState: "RUNNING", timeToEnd: 2520, cyclePhase: "MAINWASH", userSelections: { programUID: "ECO" } }) } });
    expect(await t.p.getSummary()).toEqual({ appliance: "Diskmaskin", state: "RUNNING", stateText: "Pågår", program: "Eco", phase: "Mainwash", minutesLeft: 42, doneAt: new Date(NOW + 2_520_000).toISOString(), connected: true });
    expect(t.calls).toEqual(["/appliances Bearer TOK KEY", "/appliances/DW1/state Bearer TOK KEY"]);
    expect(t.saved()).toEqual({ id: "DW1", name: "Diskmaskin", fetchedAt: NOW });
  });
  it("with a fresh cache only the state is fetched", async () => {
    const t = setup({ "/appliances/DW1/state": { status: 200, body: state({ applianceState: "END_OF_CYCLE", timeToEnd: 0 }) } }, { id: "DW1", name: "Diskmaskin", fetchedAt: NOW - 3_600_000 });
    expect(await t.p.getSummary()).toMatchObject({ state: "END_OF_CYCLE", stateText: "Klar", minutesLeft: null, doneAt: null });
    expect(t.calls).toHaveLength(1);
  });
  it("disconnected appliance and missing fields do not crash", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/state": { status: 200, body: state({}, "Disconnected") } });
    expect(await t.p.getSummary()).toMatchObject({ state: "UNKNOWN", stateText: "Okänt läge", program: null, phase: null, connected: false });
  });
  it("no dishwasher: uses the first appliance; no appliances: clear error", async () => {
    const t = setup({ "/appliances": { status: 200, body: [APPLIANCES[0]] }, "/appliances/OV1/state": { status: 200, body: state({ applianceState: "OFF" }) } });
    expect((await t.p.getSummary()).appliance).toBe("Ugn");
    await expect(setup({ "/appliances": { status: 200, body: [] } }).p.getSummary()).rejects.toThrow(/apparat/);
  });
  it("401 and 429 give clear errors", async () => {
    await expect(setup({ "/appliances": { status: 401 } }).p.getSummary()).rejects.toThrow(/anslut igen/);
    await expect(setup({ "/appliances": { status: 429 } }).p.getSummary()).rejects.toThrow(/begränsar/);
  });
  it("passes the schema; ttl 60 s", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/state": { status: 200, body: state({ applianceState: "OFF" }) } });
    expect((await safeSummary(t.p)).status).toBe("ok");
    expect(t.p.ttlSeconds).toBe(60);
    expect(t.p.id).toBe("aeg");
  });
});
