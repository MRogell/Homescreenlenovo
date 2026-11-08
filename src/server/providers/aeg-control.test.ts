import { describe, expect, it } from "vitest";
import { AegControlError, controlAeg, setAegProgram } from "./aeg-control";

function rec(status: number) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const deps = (f: { fn: typeof fetch }) => ({ getToken: async () => "TOK", getApiKey: async () => "KEY", fetchFn: f.fn });

describe("controlAeg", () => {
  it.each([["start", "START"], ["pause", "PAUSE"], ["resume", "RESUME"], ["stop", "STOPRESET"]] as const)("%s sends executeCommand %s with token and api key", async (action, cmd) => {
    const f = rec(200);
    await controlAeg(action, "DW1", deps(f));
    expect(f.calls).toEqual([{ url: "https://api.developer.electrolux.one/api/v1/appliances/DW1/command", method: "PUT", headers: expect.objectContaining({ Authorization: "Bearer TOK", "x-api-key": "KEY", "Content-Type": "application/json" }), body: { executeCommand: cmd } }]);
  });
  it("wraps the command for DAM appliances (id starting with 1:)", async () => {
    const f = rec(200);
    await controlAeg("pause", "1:ABC", deps(f));
    expect(f.calls[0]!.url).toBe("https://api.developer.electrolux.one/api/v1/appliances/1%3AABC/command");
    expect(f.calls[0]!.body).toEqual({ commands: [{ executeCommand: "PAUSE" }] });
  });
  it.each([[401, "reauth"], [403, "not_allowed"], [406, "not_allowed"], [409, "not_allowed"], [422, "not_allowed"], [429, "rate_limit"], [500, "failed"]])("status %i gives %s", async (status, code) => {
    const e = (await controlAeg("start", "DW1", deps(rec(status))).catch((x) => x)) as AegControlError;
    expect(e).toBeInstanceOf(AegControlError);
    expect(e.code).toBe(code);
    expect(e.message).not.toContain("TOK");
  });
  it("missing api key gives reauth without calling Electrolux", async () => {
    const f = rec(200);
    const e = (await controlAeg("start", "DW1", { ...deps(f), getApiKey: async () => null }).catch((x) => x)) as AegControlError;
    expect(e.code).toBe("reauth");
    expect(f.calls).toHaveLength(0);
  });
});

describe("setAegProgram", () => {
  it("sends the program as a userSelection with token and api key", async () => {
    const f = rec(200);
    await setAegProgram("QUICK_30", "DW1", deps(f));
    expect(f.calls).toEqual([{ url: "https://api.developer.electrolux.one/api/v1/appliances/DW1/command", method: "PUT", headers: expect.objectContaining({ Authorization: "Bearer TOK", "x-api-key": "KEY" }), body: { userSelections: { programUID: "QUICK_30" } } }]);
  });
  it("wraps the command for DAM appliances", async () => {
    const f = rec(200);
    await setAegProgram("ECO", "1:ABC", deps(f));
    expect(f.calls[0]!.body).toEqual({ commands: [{ userSelections: { programUID: "ECO" } }] });
  });
  it.each([[401, "reauth"], [403, "program_locked"], [406, "program_locked"], [409, "program_locked"], [422, "program_locked"], [429, "rate_limit"], [500, "failed"]])("status %i gives %s", async (status, code) => {
    const e = (await setAegProgram("ECO", "DW1", deps(rec(status))).catch((x) => x)) as AegControlError;
    expect(e).toBeInstanceOf(AegControlError);
    expect(e.code).toBe(code);
    expect(e.message).not.toContain("TOK");
    expect(e.message).not.toContain("KEY");
  });
  it("missing api key gives reauth without calling Electrolux", async () => {
    const f = rec(200);
    const e = (await setAegProgram("ECO", "DW1", { ...deps(f), getApiKey: async () => null }).catch((x) => x)) as AegControlError;
    expect(e.code).toBe("reauth");
    expect(f.calls).toHaveLength(0);
  });
});
