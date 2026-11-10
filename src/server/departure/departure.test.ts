import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DEPARTURE } from "@/lib/departure";
import { db } from "../db";
import { handleDeparture, type DepartureRequest } from "./flow";
import { claimDeparture, finishRun, loadDeparture, saveDeparture, setSkipToday } from "./store";
import { contextOf, getDepartureView, preheatTick } from "./tick";
import { handlePreheatCron } from "./cron";

// Måndag 9 november 2026, svensk tid (UTC+1). Avresa 07:30, start 07:15.
const at = (hm: string, day = "2026-11-09") => new Date(`${day}T${hm}:00+01:00`);
const cold = { tempC: -4, climateOn: false };
const patch = { enabled: true, times: { "1": ["07:30"], "2": ["07:30"] }, leadMin: 15, belowC: 5, targetC: 21 };
const states = (tempC: number | null, climateOn: boolean | null) => ({
  weather: tempC === null ? { status: "unavailable" as const, reason: "x" } : { status: "ok" as const, data: { tempC }, fetchedAt: "x" },
  skoda: { status: "ok" as const, data: { climateOn }, fetchedAt: "x" },
}) as never;

beforeEach(async () => { await db.appSetting.deleteMany(); await db.snapshot.deleteMany(); });

describe("store", () => {
  it("sparar inställningar och normaliserar", async () => {
    await saveDeparture(patch, db);
    expect(await loadDeparture(db)).toMatchObject({ enabled: true, times: { "1": ["07:30"], "2": ["07:30"] }, leadMin: 15 });
    expect((await loadDeparture(db)).last).toBeNull();
  });
  it("hoppa över idag och ångra", async () => {
    await saveDeparture(patch, db);
    expect((await setSkipToday(true, at("06:00"), db)).skipDate).toBe("2026-11-09");
    expect((await setSkipToday(false, at("06:00"), db)).skipDate).toBeNull();
    expect((await setSkipToday(true, at("06:00"), db)).skipDate).toBe("2026-11-09");
    expect((await setSkipToday(false, at("06:00", "2026-11-10"), db)).skipDate).toBe("2026-11-09"); // ångra gäller bara dagens
  });
  it("ingen start före fönstret eller när det är varmt; skippet sparas", async () => {
    await saveDeparture(patch, db);
    expect(await claimDeparture(at("06:00"), cold, db)).toMatchObject({ action: "other", decision: { kind: "wait" } });
    expect(await claimDeparture(at("07:20"), { tempC: 9, climateOn: false }, db)).toMatchObject({ action: "other", decision: { kind: "skip", reason: "warm" } });
    expect((await loadDeparture(db)).last).toMatchObject({ status: "skipped_warm", tempC: 9 });
    expect(await claimDeparture(at("07:25"), cold, db)).toMatchObject({ action: "other", decision: { kind: "done" } }); // redan avgjort idag
  });
  it("två skärmar som hämtar samtidigt startar bilen en gång", async () => {
    await saveDeparture(patch, db);
    const r = await Promise.all(Array.from({ length: 6 }, () => claimDeparture(at("07:20"), cold, db)));
    expect(r.filter((x) => x.action === "start")).toHaveLength(1);
    expect((await loadDeparture(db)).last).toMatchObject({ status: "starting", attempts: 1 });
  });
  it("misslyckad start försöks igen, högst tre gånger", async () => {
    await saveDeparture(patch, db);
    for (let i = 1; i <= 3; i++) {
      const c = await claimDeparture(at("07:20"), cold, db);
      expect(c.action).toBe("start");
      await finishRun(false, at("07:20"), db);
      expect((await loadDeparture(db)).last).toMatchObject({ status: "failed", attempts: i });
    }
    expect(await claimDeparture(at("07:21"), cold, db)).toMatchObject({ action: "other", decision: { kind: "done" } });
  });
  it("lyckad start avslutas som startad", async () => {
    await saveDeparture(patch, db);
    await claimDeparture(at("07:20"), cold, db);
    await finishRun(true, at("07:20"), db);
    expect((await loadDeparture(db)).last?.status).toBe("started");
  });
});

describe("contextOf", () => {
  it("läser temperatur och klimatläge, okänt blir null", () => {
    expect(contextOf(states(-4, true))).toEqual({ tempC: -4, climateOn: true });
    expect(contextOf(states(null, null))).toEqual({ tempC: null, climateOn: null });
    expect(contextOf({} as never)).toEqual({ tempC: null, climateOn: null });
  });
});

describe("preheatTick", () => {
  it("startar klimatet med måltemperaturen och skickar en notis", async () => {
    await saveDeparture({ ...patch, targetC: 22.5 }, db);
    const start = vi.fn(async () => null);
    const notify = vi.fn(async (..._a: unknown[]) => {});
    await preheatTick(states(-4, false), at("07:20"), { db, start, notify });
    expect(start).toHaveBeenCalledWith(22.5);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatchObject([{ kind: "preheat", key: "preheat:2026-11-09:0", title: "Bilen förvärms" }]);
    expect((await loadDeparture(db)).last?.status).toBe("started");
    // Nästa hämtning samma morgon gör ingenting mer.
    await preheatTick(states(-4, false), at("07:21"), { db, start, notify });
    expect(start).toHaveBeenCalledOnce();
  });
  it("misslyckas starten: markeras som misslyckad, ingen notis, och försöks igen vid nästa hämtning", async () => {
    await saveDeparture(patch, db);
    const start = vi.fn(async () => "failed");
    const notify = vi.fn(async () => {});
    await preheatTick(states(-4, false), at("07:20"), { db, start, notify });
    expect(notify).not.toHaveBeenCalled();
    expect((await loadDeparture(db)).last).toMatchObject({ status: "failed", attempts: 1 });
    await preheatTick(states(-4, false), at("07:21"), { db, start, notify });
    expect(start).toHaveBeenCalledTimes(2);
  });
  it("varmt ute, klimatet igång, avstängt, fel dag eller hoppat över: ingen start", async () => {
    const start = vi.fn(async () => null);
    const deps = { db, start, notify: vi.fn(async () => {}) };
    await saveDeparture(patch, db);
    await preheatTick(states(9, false), at("07:20"), deps);
    await db.appSetting.deleteMany();
    await saveDeparture(patch, db);
    await preheatTick(states(-4, true), at("07:20"), deps);
    await db.appSetting.deleteMany();
    await saveDeparture({ ...patch, enabled: false }, db);
    await preheatTick(states(-4, false), at("07:20"), deps);
    await db.appSetting.deleteMany();
    await saveDeparture(patch, db);
    await preheatTick(states(-4, false), at("07:20", "2026-11-14"), deps); // lördag
    await setSkipToday(true, at("07:00", "2026-11-10"), db);
    await preheatTick(states(-4, false), at("07:20", "2026-11-10"), deps);
    expect(start).not.toHaveBeenCalled();
  });
  it("okänd temperatur: startar ändå", async () => {
    await saveDeparture(patch, db);
    const start = vi.fn(async () => null);
    await preheatTick(states(null, false), at("07:20"), { db, start, notify: vi.fn(async () => {}) });
    expect(start).toHaveBeenCalledOnce();
  });
  it("fel i start eller notis stoppar aldrig anroparen", async () => {
    await saveDeparture(patch, db);
    await expect(preheatTick(states(-4, false), at("07:20"), { db, start: async () => { throw new Error("boom"); }, notify: async () => {} })).resolves.toBeUndefined();
  });
});

describe("handleDeparture", () => {
  const ok: DepartureRequest = { body: { settings: patch }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };
  const deps = { db, states: async () => states(-4, false), now: () => at("06:00") };
  it("utan session 401, fel Origin 403, ogiltigt 400, inget sparas", async () => {
    expect((await handleDeparture({ ...ok, userId: null }, deps)).status).toBe(401);
    expect((await handleDeparture({ ...ok, origin: "https://ond.example.com" }, deps)).status).toBe(403);
    expect((await handleDeparture({ ...ok, origin: null }, deps)).status).toBe(403);
    const bad = [null, {}, { settings: {} }, { settings: { ...patch, extra: 1 } }, { settings: { ...patch, times: {} } }, { settings: { ...patch, times: { "8": "07:30" } } }, { settings: { ...patch, times: { "1": "25:00" } } },
      { settings: { ...patch, leadMin: 7 } }, { settings: { ...patch, belowC: 40 } }, { settings: { ...patch, belowC: 1.5 } }, { settings: { ...patch, targetC: 15 } }, { settings: { ...patch, targetC: 21.3 } }, { skip: "ja" }, { skip: true, extra: 1 }];
    for (const body of bad) expect((await handleDeparture({ ...ok, body }, deps)).status, JSON.stringify(body)).toBe(400);
    expect(await loadDeparture(db)).toEqual(DEFAULT_DEPARTURE);
  });
  it("sparar och svarar med raden som ska visas", async () => {
    const r = await handleDeparture(ok, deps);
    expect(r.status).toBe(200);
    expect(r.json.departure).toMatchObject({ line: "Avresa 07:30 · mån, tis", tone: "wait", settings: { enabled: true } });
    const s = await handleDeparture({ ...ok, body: { skip: true } }, deps);
    expect(s.json.departure?.settings.skippedToday).toBe(true);
  });
});

describe("servertimern (cron)", () => {
  const secret = "hemlig-nyckel-1234567890";
  const auth = { authorization: `Bearer ${secret}` };
  it("saknad eller fel hemlighet ger 503 och 401 och rör ingenting", async () => {
    await saveDeparture(patch, db);
    expect((await handlePreheatCron(auth, undefined, { db, now: () => at("07:20") })).status).toBe(503);
    for (const a of [null, "Bearer fel", "hemlig-nyckel-1234567890", "Bearer "]) {
      expect((await handlePreheatCron({ authorization: a }, secret, { db, now: () => at("07:20") })).status).toBe(401);
    }
    expect(await db.appSetting.findUnique({ where: { key: "departureTimer" } })).toBeNull();
  });
  it("utanför förvärmfönstret görs inget (inga anrop) men timern märks som aktiv", async () => {
    await saveDeparture(patch, db);
    const getStates = vi.fn(async () => states(-4, false));
    const r = await handlePreheatCron(auth, secret, { db, now: () => at("12:00"), states: getStates });
    expect(r).toEqual({ status: 200, json: { ok: true, action: "none" } });
    expect(getStates).not.toHaveBeenCalled();
    const view = await getDepartureView(states(-4, false), at("12:00"), db);
    expect(view.timer?.active).toBe(true);
    expect((await getDepartureView(states(-4, false), at("12:10"), db)).timer?.active).toBe(false);
  });
  it("i fönstret startas klimatet utan att någon skärm är öppen, en gång", async () => {
    await saveDeparture({ ...patch, targetC: 22 }, db);
    const start = vi.fn(async () => null);
    const notify = vi.fn(async () => {});
    const getStates = vi.fn(async () => states(-4, false));
    await handlePreheatCron(auth, secret, { db, now: () => at("07:16"), states: getStates, start, notify });
    await handlePreheatCron(auth, secret, { db, now: () => at("07:17"), states: getStates, start, notify });
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(22);
    expect((await loadDeparture(db)).last?.status).toBe("started");
  });
  it("varmt ute: hoppar över och startar inte", async () => {
    await saveDeparture(patch, db);
    const start = vi.fn(async () => null);
    await handlePreheatCron(auth, secret, { db, now: () => at("07:16"), states: async () => states(12, false), start });
    expect(start).not.toHaveBeenCalled();
    expect((await loadDeparture(db)).last?.status).toBe("skipped_warm");
  });
});
