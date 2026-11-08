import { beforeEach, describe, expect, it } from "vitest";
import { CARD_IDS } from "@/lib/settings";
import { createPrisma } from "./db";
import { handleSettings, type SettingsRequest } from "./settings-flow";
import { getSettings } from "./settings";

const db = createPrisma(process.env.DATABASE_URL);
const ok: SettingsRequest = { body: { night: { enabled: true, from: "21:00", to: "07:00" } }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };

beforeEach(async () => {
  await db.appSetting.deleteMany();
  await db.snapshot.deleteMany();
  await db.providerBackoff.deleteMany();
  await db.snapshot.create({ data: { provider: "weather", payload: {}, fetchedAt: new Date() } });
  await db.snapshot.create({ data: { provider: "spotify", payload: {}, fetchedAt: new Date() } });
});

describe("handleSettings", () => {
  it("without session is 401 and saves nothing", async () => {
    expect((await handleSettings({ ...ok, userId: null }, db)).status).toBe(401);
    expect(await db.appSetting.count()).toBe(0);
  });
  it("other or missing origin is 403 and saves nothing", async () => {
    expect((await handleSettings({ ...ok, origin: "https://ond.example.com" }, db)).status).toBe(403);
    expect((await handleSettings({ ...ok, origin: null }, db)).status).toBe(403);
    expect(await db.appSetting.count()).toBe(0);
  });
  it("invalid bodies are 400 and save nothing", async () => {
    for (const body of [null, {}, "x", [], { x: 1 }, { cards: { order: ["weather"], hidden: [] } }, { place: { name: "X", lat: 99, lon: 0 } }, { night: { enabled: true, from: "25:00", to: "06:00" } }]) {
      expect((await handleSettings({ ...ok, body }, db)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await db.appSetting.count()).toBe(0);
  });
  it("a valid patch is saved and the new settings are returned", async () => {
    const r = await handleSettings(ok, db);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ settings: { night: { enabled: true, from: "21:00", to: "07:00" } } });
    expect((await getSettings(db)).night.enabled).toBe(true);
  });
  it("changing the place clears only the weather snapshot so the new place is fetched next time", async () => {
    await handleSettings({ ...ok, body: { place: { name: "Umeå", lat: 63.8, lon: 20.3 } } }, db);
    expect((await db.snapshot.findMany()).map((s) => s.provider)).toEqual(["spotify"]);
  });
  it("night mode and card changes leave the snapshots alone", async () => {
    await handleSettings(ok, db);
    await handleSettings({ ...ok, body: { cards: { order: [...CARD_IDS].reverse(), hidden: [] } } }, db);
    expect(await db.snapshot.count()).toBe(2);
  });
  it("reset also clears the weather snapshot (the place goes back to the default)", async () => {
    await handleSettings({ ...ok, body: { reset: true } }, db);
    expect((await db.snapshot.findMany()).map((s) => s.provider)).toEqual(["spotify"]);
  });
});
