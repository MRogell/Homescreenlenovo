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
    expect(await t.p.getSummary()).toEqual({ appliance: "Diskmaskin", state: "RUNNING", stateText: "Pågår", program: "Eco", programUid: "ECO", programs: [], phase: "Mainwash", minutesLeft: 42, doneAt: new Date(NOW + 2_520_000).toISOString(), connected: true, remoteControl: null });
    expect(t.calls).toEqual(["/appliances Bearer TOK KEY", "/appliances/DW1/info Bearer TOK KEY", "/appliances/DW1/state Bearer TOK KEY"]);
    expect(t.saved()).toEqual({ id: "DW1", name: "Diskmaskin", fetchedAt: NOW }); // /info svarade inte här: ingen programlista sparas, nästa gång försöks det igen
  });
  it("with a fresh cache only the state is fetched", async () => {
    const t = setup({ "/appliances/DW1/state": { status: 200, body: state({ applianceState: "END_OF_CYCLE", timeToEnd: 0 }) } }, { id: "DW1", name: "Diskmaskin", fetchedAt: NOW - 3_600_000, programs: ["ECO"] });
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
  it("reports whether remote control is enabled", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/state": { status: 200, body: state({ applianceState: "READY_TO_START", remoteControl: "ENABLED" }) } });
    expect((await t.p.getSummary()).remoteControl).toBe("ENABLED");
    const u = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/state": { status: 200, body: state({ applianceState: "READY_TO_START" }) } });
    expect((await u.p.getSummary()).remoteControl).toBeNull();
  });
  it("passes the schema; ttl 60 s", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/state": { status: 200, body: state({ applianceState: "OFF" }) } });
    expect((await safeSummary(t.p)).status).toBe("ok");
    expect(t.p.ttlSeconds).toBe(60);
    expect(t.p.id).toBe("aeg");
  });
});

describe("aeg provider programs", () => {
  const INFO = { capabilities: { "userSelections/programUID": { type: "string", values: { ECO: {}, QUICK_30: {}, GLASS: { disabled: true } } } } };
  const ST = { status: 200, body: state({ applianceState: "READY_TO_START", userSelections: { programUID: "QUICK_30" } }) };
  it("reads the supported programs from /info once, caches them and reports the current program", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/info": { status: 200, body: INFO }, "/appliances/DW1/state": ST });
    expect(await t.p.getSummary()).toMatchObject({ programs: ["ECO", "QUICK_30"], programUid: "QUICK_30", program: "Snabb 30" });
    expect(t.saved()).toEqual({ id: "DW1", name: "Diskmaskin", fetchedAt: NOW, programs: ["ECO", "QUICK_30"] });
  });
  it("a fresh cache with programs needs no /info call", async () => {
    const t = setup({ "/appliances/DW1/state": ST }, { id: "DW1", name: "Diskmaskin", fetchedAt: NOW - 1000, programs: ["ECO"] });
    expect((await t.p.getSummary()).programs).toEqual(["ECO"]);
    expect(t.calls).toHaveLength(1);
  });
  it("an old cache without programs fetches /info once", async () => {
    const t = setup({ "/appliances/DW1/info": { status: 200, body: INFO }, "/appliances/DW1/state": ST }, { id: "DW1", name: "Diskmaskin", fetchedAt: NOW - 1000 });
    expect((await t.p.getSummary()).programs).toEqual(["ECO", "QUICK_30"]);
    expect(t.calls.map((c) => c.split(" ")[0])).toEqual(["/appliances/DW1/info", "/appliances/DW1/state"]);
  });
  it("/info failing does not break the card and is retried next time", async () => {
    const t = setup({ "/appliances": { status: 200, body: APPLIANCES }, "/appliances/DW1/info": { status: 500 }, "/appliances/DW1/state": ST });
    expect((await t.p.getSummary()).programs).toEqual([]);
    expect(t.saved()).toEqual({ id: "DW1", name: "Diskmaskin", fetchedAt: NOW });
  });
});
