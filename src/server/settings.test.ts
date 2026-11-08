import { beforeEach, describe, expect, it } from "vitest";
import { CARD_IDS, DEFAULT_SETTINGS } from "@/lib/settings";
import { createPrisma } from "./db";
import { applySettingsPatch, getSettings } from "./settings";

const db = createPrisma(process.env.DATABASE_URL);
beforeEach(async () => { await db.appSetting.deleteMany(); });

describe("getSettings", () => {
  it("an empty table gives the defaults", async () => {
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
  it("corrupt stored values never throw and fall back to the defaults", async () => {
    await db.appSetting.createMany({ data: [{ key: "cards", value: "trasigt" }, { key: "place", value: { name: 5 } }, { key: "night", value: [1, 2] }, { key: "okänd", value: {} }] });
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("applySettingsPatch", () => {
  const reversed = [...CARD_IDS].reverse();
  it("saves the card order and hidden cards and reads them back", async () => {
    const s = await applySettingsPatch({ cards: { order: reversed, hidden: ["tado"] } }, db);
    expect(s.cards).toEqual({ order: reversed, hidden: ["tado"] });
    expect((await getSettings(db)).cards).toEqual({ order: reversed, hidden: ["tado"] });
  });
  it("a patch only changes its own part", async () => {
    await applySettingsPatch({ night: { enabled: true, from: "21:00", to: "07:00" } }, db);
    await applySettingsPatch({ place: { name: "Umeå", lat: 63.8, lon: 20.3 } }, db);
    const s = await getSettings(db);
    expect(s.night).toEqual({ enabled: true, from: "21:00", to: "07:00" });
    expect(s.place).toEqual({ name: "Umeå", lat: 63.8, lon: 20.3 });
    expect(s.cards).toEqual(DEFAULT_SETTINGS.cards);
  });
  it("saving the same part twice keeps one row (upsert)", async () => {
    await applySettingsPatch({ night: { enabled: true, from: "22:00", to: "06:00" } }, db);
    await applySettingsPatch({ night: { enabled: false, from: "23:00", to: "05:00" } }, db);
    expect(await db.appSetting.count({ where: { key: "night" } })).toBe(1);
    expect((await getSettings(db)).night).toEqual({ enabled: false, from: "23:00", to: "05:00" });
  });
  it("place null removes the saved place", async () => {
    await applySettingsPatch({ place: { name: "Umeå", lat: 63.8, lon: 20.3 } }, db);
    expect((await applySettingsPatch({ place: null }, db)).place).toBeNull();
    expect(await db.appSetting.count({ where: { key: "place" } })).toBe(0);
  });
  it("reset removes everything", async () => {
    await applySettingsPatch({ cards: { order: reversed, hidden: ["aeg"] } }, db);
    await applySettingsPatch({ night: { enabled: true, from: "21:00", to: "07:00" } }, db);
    expect(await applySettingsPatch({ reset: true }, db)).toEqual(DEFAULT_SETTINGS);
    expect(await db.appSetting.count()).toBe(0);
  });
});
