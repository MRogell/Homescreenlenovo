import { describe, expect, it } from "vitest";
import { aegStateText, jwtExpiryMs, programName } from "./aeg";

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
