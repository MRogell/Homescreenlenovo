import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { applySettingsPatch } from "../settings";
import { chargeReminderDue, chargeReminderTick } from "./charge";
import { cancelTimer, handleTimers, loadTimers, startTimer, timersTick } from "./timers";

const at = (hm: string, day = "2026-11-11") => new Date(`${day}T${hm}:00+01:00`);
const car = (levelPct: number | null, charging = false, levelKind = "battery") => ({ skoda: { status: "ok" as const, data: { levelKind, levelPct, charging, rangeKm: 100, locked: true, parked: null }, fetchedAt: "x" } }) as never;
const req = (body: unknown) => ({ body, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" });

beforeEach(async () => { await db.appSetting.deleteMany(); await db.notificationEvent.deleteMany(); await db.pushSubscription.deleteMany(); });

describe("laddpåminnelse", () => {
  it("skickar en notis med batterinivån, och bara en gång per dygn", async () => {
    const notify = vi.fn(async (..._a: unknown[]) => {});
    await chargeReminderTick(car(37), at("19:05"), { db, notify });
    await chargeReminderTick(car(37), at("19:06"), { db, notify });
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatchObject([{ kind: "chargeReminder", key: "charge_reminder:2026-11-11", title: "Ladda bilen", body: "Bilen har 37 %, ladda ikväll." }]);
    // Nästa dygn igen.
    await chargeReminderTick(car(30), at("19:05", "2026-11-12"), { db, notify });
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("inte när bilen laddar, har tillräckligt eller är avstängd i inställningarna", async () => {
    const notify = vi.fn(async () => {});
    await chargeReminderTick(car(20, true), at("19:05"), { db, notify });
    await chargeReminderTick(car(80), at("19:05", "2026-11-12"), { db, notify });
    await applySettingsPatch({ smart: { chargeReminder: { enabled: false, belowPct: 40, at: "19:00" }, timer: { enabled: true } } }, db);
    await chargeReminderTick(car(10), at("19:05", "2026-11-13"), { db, notify });
    expect(notify).not.toHaveBeenCalled();
  });
  it("okänt värde markerar inte dagen, så nästa hämtning försöker igen", async () => {
    const notify = vi.fn(async () => {});
    await chargeReminderTick({ skoda: { status: "unavailable", reason: "x" } } as never, at("19:05"), { db, notify });
    expect(await chargeReminderDue(at("19:06"), db)).toBe(true);
    await chargeReminderTick(car(25), at("19:06"), { db, notify });
    expect(notify).toHaveBeenCalledOnce();
    expect(await chargeReminderDue(at("19:07"), db)).toBe(false);
  });
  it("egen gräns och eget klockslag gäller", async () => {
    await applySettingsPatch({ smart: { chargeReminder: { enabled: true, belowPct: 60, at: "21:00" }, timer: { enabled: true } } }, db);
    const notify = vi.fn(async () => {});
    await chargeReminderTick(car(55), at("20:30"), { db, notify });
    expect(notify).not.toHaveBeenCalled();
    await chargeReminderTick(car(55), at("21:10"), { db, notify });
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe("timers", () => {
  it("startar, listar tidigast först, tar högst tre och avbryter", async () => {
    const now = at("12:00");
    await startTimer(10, "Ägg", now, db, "a");
    await startTimer(5, "", now, db, "b");
    await startTimer(15, "Pasta", now, db, "c");
    expect(await startTimer(1, "", now, db, "d")).toBe("full");
    expect((await loadTimers(db)).map((t) => t.id)).toEqual(["b", "a", "c"]);
    expect((await cancelTimer("a", now, db)).map((t) => t.id)).toEqual(["b", "c"]);
  });
  it("notis när den gått av, en gång, och gamla städas", async () => {
    await startTimer(5, "Ägg", at("12:00"), db, "a");
    const notify = vi.fn(async (..._a: unknown[]) => {});
    await timersTick(at("12:04"), { db, notify });
    expect(notify).not.toHaveBeenCalled();
    await timersTick(at("12:06"), { db, notify });
    await timersTick(at("12:07"), { db, notify });
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatchObject([{ kind: "timer", key: "timer:a", title: "Ägg är klar" }]);
    await timersTick(at("12:30"), { db, notify });
    expect(await loadTimers(db)).toEqual([]);
  });
  it("släckt i inställningarna: ingen notis", async () => {
    await applySettingsPatch({ smart: { chargeReminder: { enabled: true, belowPct: 40, at: "19:00" }, timer: { enabled: false } } }, db);
    await startTimer(1, "", at("12:00"), db, "a");
    const notify = vi.fn(async () => {});
    await timersTick(at("12:02"), { db, notify });
    expect(notify).not.toHaveBeenCalled();
  });
  it("API: session, Origin och strikt indata", async () => {
    const now = () => at("12:00");
    expect((await handleTimers({ ...req({ start: { minutes: 5 } }), userId: null }, { db, now })).status).toBe(401);
    expect((await handleTimers({ ...req({ start: { minutes: 5 } }), origin: "https://ond.example.com" }, { db, now })).status).toBe(403);
    for (const bad of [null, {}, { start: { minutes: 0 } }, { start: { minutes: 999 } }, { start: { minutes: 5, extra: 1 } }, { start: { minutes: 5 }, cancel: "a" }, { cancel: "" }]) {
      expect((await handleTimers(req(bad), { db, now })).status).toBe(400);
    }
    const ok = await handleTimers(req({ start: { minutes: 7.5, label: " Ägg " } }), { db, now });
    expect(ok.status).toBe(200);
    expect(ok.json.timers).toMatchObject([{ label: "Ägg", endsAt: at("12:07:30".slice(0, 5)).getTime() + 30_000 }]);
    const id = ok.json.timers![0]!.id;
    expect((await handleTimers(req({ cancel: id }), { db, now })).json.timers).toEqual([]);
  });
});
