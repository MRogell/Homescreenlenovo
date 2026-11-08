import { describe, expect, it } from "vitest";
import { skodaSchema, type SkodaData } from "@/server/providers/schemas";
import { clampTemp, shortAddress, skodaView } from "./skoda-view";

const NOW = new Date("2026-11-08T18:00:00+01:00");
const base: SkodaData = skodaSchema.parse({ rangeKm: 312, levelPct: 78, levelKind: "battery", locked: true, charging: false, parked: "Storgatan 1", doorsOpen: false, windowsOpen: false, trunkOpen: false, bonnetOpen: false });
const v = (d: Partial<SkodaData>) => skodaView({ ...base, ...d }, NOW);

describe("skodaView pill", () => {
  it("everything closed and locked gives green Låst", () => {
    expect(v({}).pill).toEqual({ text: "Låst", tone: "ok" });
  });
  it("open door beats everything else", () => {
    expect(v({ doorsOpen: true, trunkOpen: true, locked: false, charging: true }).pill).toEqual({ text: "Dörr öppen", tone: "bad" });
  });
  it("then trunk, windows and bonnet, in that order", () => {
    expect(v({ trunkOpen: true, windowsOpen: true }).pill.text).toBe("Bagagelucka öppen");
    expect(v({ windowsOpen: true, bonnetOpen: true }).pill.text).toBe("Fönster öppet");
    expect(v({ bonnetOpen: true }).pill.text).toBe("Motorhuv öppen");
  });
  it("unlocked is a warning, before charging", () => {
    expect(v({ locked: false, charging: true }).pill).toEqual({ text: "Olåst", tone: "warn" });
  });
  it("charging and locked shows Laddar", () => {
    expect(v({ charging: true }).pill).toEqual({ text: "Laddar", tone: "ok" });
  });
  it("unknown lock state never claims locked", () => {
    expect(v({ locked: null }).pill).toEqual({ text: "Okänt läge" });
  });
});

describe("skodaView charging line", () => {
  it("is hidden when not charging", () => {
    expect(v({ chargeKw: 11, chargeMinutesLeft: 30 }).chargeLine).toBeNull();
    expect(v({ chargeTargetPct: 80 }).targetPct).toBeNull();
  });
  it("shows power, ready time and target while charging", () => {
    const r = v({ charging: true, chargeKw: 11, chargeMinutesLeft: 95, chargeTargetPct: 80 });
    expect(r.chargeLine).toBe("11\u00a0kW · klar ca\u00a019:35 · mål\u00a080\u00a0%");
    expect(r.targetPct).toBe(80);
  });
  it("uses Swedish decimals and skips missing parts", () => {
    expect(v({ charging: true, chargeKw: 7.4 }).chargeLine).toBe("7,4\u00a0kW");
    expect(v({ charging: true }).chargeLine).toBe("Laddar");
  });
});

describe("skodaView checks", () => {
  it("shows lock, doors, windows and trunk in that order", () => {
    expect(v({}).checks.map((c) => [c.label, c.value, c.tone])).toEqual([
      ["Lås", "Låst", "ok"], ["Dörrar", "Stängda", "ok"], ["Fönster", "Stängda", "ok"], ["Bagage", "Stängd", "ok"],
    ]);
  });
  it("open things are red, unlocked is amber", () => {
    const r = v({ locked: false, doorsOpen: true, windowsOpen: true, trunkOpen: true });
    expect(r.checks.map((c) => [c.value, c.tone])).toEqual([["Olåst", "warn"], ["Öppen", "bad"], ["Öppet", "bad"], ["Öppen", "bad"]]);
  });
  it("values the car does not report are left out, never guessed", () => {
    expect(v({ locked: null, doorsOpen: null, windowsOpen: null, trunkOpen: null }).checks).toEqual([]);
  });
  it("bonnet only appears when it is open", () => {
    expect(v({ bonnetOpen: true }).checks.at(-1)).toMatchObject({ label: "Motorhuv", value: "Öppen", tone: "bad" });
    expect(v({ bonnetOpen: false }).checks.some((c) => c.label === "Motorhuv")).toBe(false);
  });
});

describe("skodaView level, place and report time", () => {
  it("level text names battery or fuel", () => {
    expect(v({}).levelText).toBe("78 % batteri");
    expect(v({ levelKind: "fuel", levelPct: 40 }).levelText).toBe("40 % tank");
    expect(v({ levelPct: null }).levelText).toBeNull();
  });
  it("report time today is just the clock, older shows the day", () => {
    expect(v({ capturedAt: "2026-11-08T13:32:00+01:00" }).reported).toBe("Bilen rapporterade 13:32");
    expect(v({ capturedAt: "2026-11-07T13:32:00+01:00" }).reported).toBe("Bilen rapporterade igår 13:32");
    expect(v({ capturedAt: "2026-11-01T13:32:00+01:00" }).reported).toMatch(/^Bilen rapporterade 1 nov\.? 13:32$/);
    expect(v({ capturedAt: null }).reported).toBeNull();
    expect(v({ capturedAt: "inte ett datum" }).reported).toBeNull();
  });
  it("place falls back to unknown", () => {
    expect(v({ parked: null }).place).toBe("Plats okänd");
  });
  it("old payloads without the new fields still parse", () => {
    const old = skodaSchema.parse({ rangeKm: 1, levelPct: 2, levelKind: "fuel", locked: null, charging: false, parked: null });
    expect(skodaView(old, NOW).checks).toEqual([]);
  });
});

describe("shortAddress", () => {
  it("drops the postal code and country", () => {
    expect(shortAddress("Klintvägen 247B, 973 32 Innerstaden-Östermalm")).toBe("Klintvägen 247B, Innerstaden-Östermalm");
    expect(shortAddress("Storgatan 1, 97231 Luleå, Sverige")).toBe("Storgatan 1, Luleå");
  });
  it("keeps house numbers and plain addresses", () => {
    expect(shortAddress("Storgatan 12")).toBe("Storgatan 12");
  });
  it("the card keeps the full address for the tooltip", () => {
    const r = skodaView({ ...base, parked: "Storgatan 1, 972 31 Luleå" }, NOW);
    expect(r.place).toBe("Storgatan 1, Luleå");
    expect(r.placeFull).toBe("Storgatan 1, 972 31 Luleå");
  });
});

describe("skodaView climate", () => {
  it("on with target and ready time", () => {
    const c = v({ climateOn: true, climateTargetC: 21, climateReadyAt: "2026-11-08T18:45:00+01:00" }).climate;
    expect(c).toEqual({ on: true, targetC: 21, text: "Klimat på · 21\u00a0°C · varm ca\u00a018:45" });
  });
  it("on without ready time and half degrees with Swedish decimal", () => {
    expect(v({ climateOn: true, climateTargetC: 21.5 }).climate.text).toBe("Klimat på · 21,5\u00a0°C");
    expect(v({ climateOn: true }).climate.text).toBe("Klimat på");
  });
  it("off or unknown has no text", () => {
    expect(v({ climateOn: false, climateTargetC: 22 }).climate).toEqual({ on: false, targetC: 22, text: null });
    expect(v({ climateOn: null }).climate).toEqual({ on: null, targetC: null, text: null });
  });
});

describe("clampTemp", () => {
  it("rounds to half degrees within 16–29.5", () => {
    expect(clampTemp(15)).toBe(16);
    expect(clampTemp(30)).toBe(29.5);
    expect(clampTemp(21.3)).toBe(21.5);
    expect(clampTemp(21.2)).toBe(21);
    expect(clampTemp(Number.NaN)).toBe(21);
  });
});
