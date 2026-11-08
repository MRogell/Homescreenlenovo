import { describe, expect, it } from "vitest";
import { aegStateText, jwtExpiryMs, parsePrograms, programLabel, programName } from "./aeg";

describe("aeg helpers", () => {
  it.each([["OFF", "Av"], ["IDLE", "Väntar"], ["RUNNING", "Pågår"], ["PAUSED", "Pausad"], ["READY_TO_START", "Redo att starta"], ["DELAYED_START", "Startar senare"], ["END_OF_CYCLE", "Klar"], ["NÅGOT", "Okänt läge"]])("%s is %s", (s, t) => expect(aegStateText(s)).toBe(t));
  it("program names are readable", () => {
    expect(programName("ECO")).toBe("Eco");
    expect(programName("AUTO_SENSE")).toBe("Auto sense");
    expect(programName(undefined)).toBeNull();
  });
  it("reads exp from a JWT, null for garbage", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 2_000_000 })).toString("base64url");
    expect(jwtExpiryMs(`aaa.${payload}.sig`)).toBe(2_000_000_000);
    expect(jwtExpiryMs("inte-en-jwt")).toBeNull();
    expect(jwtExpiryMs(`a.${Buffer.from("{}").toString("base64url")}.b`)).toBeNull();
  });
});

describe("parsePrograms", () => {
  const info = (values: unknown) => ({ capabilities: { "userSelections/programUID": { type: "string", values } } });
  it("lists the programs the appliance supports and skips disabled ones", () => {
    expect(parsePrograms(info({ ECO: {}, AUTO_SENSE: { disabled: false }, QUICK_30: { disabled: true }, INTENSIVE_70: {} }))).toEqual(["ECO", "AUTO_SENSE", "INTENSIVE_70"]);
  });
  it("garbage, missing capability or odd ids give an empty or filtered list, never a throw", () => {
    for (const bad of [null, "x", {}, { capabilities: null }, info(null), info("ECO"), info([])]) expect(parsePrograms(bad)).toEqual([]);
    expect(parsePrograms(info({ ECO: {}, "../x": {}, "A B": {}, "": {} }))).toEqual(["ECO"]);
  });
});

describe("programLabel", () => {
  it("translates known words and keeps unknown ones readable", () => {
    expect(programLabel("ECO")).toBe("Eco");
    expect(programLabel("AUTO_SENSE")).toBe("Auto sense");
    expect(programLabel("QUICK_30")).toBe("Snabb 30");
    expect(programLabel("INTENSIVE_70")).toBe("Intensiv 70");
    expect(programLabel("GLASS_CARE")).toBe("Glas skötsel");
    expect(programLabel("MY_STRANGE_ONE")).toBe("My strange one");
    expect(programLabel(null)).toBeNull();
    expect(programLabel("")).toBeNull();
  });
});
