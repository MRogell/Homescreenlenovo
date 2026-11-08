import { describe, expect, it } from "vitest";
import { SkodaControlError, sendSkodaClimate } from "./skoda-control";

const TOKEN = "t".repeat(40);
const CFG = { url: "https://bridge.example.com", token: TOKEN };
const SUMMARY = { rangeKm: 300, levelPct: 70, levelKind: "battery", locked: true, charging: false, parked: "Hemma", climateOn: true, climateTargetC: 21, climateReadyAt: null };

function fake(status: number, body: unknown) {
  const calls: { url: string; method?: string; auth?: string; body?: string }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, auth: (init.headers as Record<string, string>).Authorization, body: init.body as string });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const code = async (p: Promise<unknown>) => p.then(() => "none", (e) => (e instanceof SkodaControlError ? e.code : "other"));

describe("sendSkodaClimate", () => {
  it("start posts the command with bearer token and returns the new summary", async () => {
    const f = fake(200, SUMMARY);
    const d = await sendSkodaClimate({ action: "climate_start", temperatureC: 21 }, { getConfig: () => CFG, fetchFn: f.fetchFn });
    expect(f.calls).toEqual([{ url: "https://bridge.example.com/api/skoda", method: "POST", auth: `Bearer ${TOKEN}`, body: JSON.stringify({ climate: "start", temperatureC: 21 }) }]);
    expect(d.climateOn).toBe(true);
  });
  it("stop posts climate stop", async () => {
    const f = fake(200, SUMMARY);
    await sendSkodaClimate({ action: "climate_stop" }, { getConfig: () => CFG, fetchFn: f.fetchFn });
    expect(f.calls[0]?.body).toBe(JSON.stringify({ climate: "stop" }));
  });
  it("429 is throttled; 502, network error and bad json are failed", async () => {
    const start = { action: "climate_start", temperatureC: 21 } as const;
    expect(await code(sendSkodaClimate(start, { getConfig: () => CFG, fetchFn: fake(429, {}).fetchFn }))).toBe("throttled");
    expect(await code(sendSkodaClimate(start, { getConfig: () => CFG, fetchFn: fake(502, {}).fetchFn }))).toBe("failed");
    expect(await code(sendSkodaClimate(start, { getConfig: () => CFG, fetchFn: fake(200, "inte json").fetchFn }))).toBe("failed");
    expect(await code(sendSkodaClimate(start, { getConfig: () => CFG, fetchFn: fake(200, { rangeKm: "x" }).fetchFn }))).toBe("failed");
    const broken = (async () => { throw new Error(`nät ${TOKEN}`); }) as unknown as typeof fetch;
    const err = await sendSkodaClimate(start, { getConfig: () => CFG, fetchFn: broken }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(SkodaControlError);
    expect((err as Error).message).not.toContain(TOKEN);
  });
  it("without config it is config and makes no call", async () => {
    const f = fake(200, SUMMARY);
    expect(await code(sendSkodaClimate({ action: "climate_stop" }, { getConfig: () => null, fetchFn: f.fetchFn }))).toBe("config");
    expect(f.calls).toHaveLength(0);
  });
  it("401 and 500 from the bridge are config", async () => {
    expect(await code(sendSkodaClimate({ action: "climate_stop" }, { getConfig: () => CFG, fetchFn: fake(401, {}).fetchFn }))).toBe("config");
    expect(await code(sendSkodaClimate({ action: "climate_stop" }, { getConfig: () => CFG, fetchFn: fake(500, {}).fetchFn }))).toBe("config");
  });
});
