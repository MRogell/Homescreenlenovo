import { describe, expect, it } from "vitest";
import { controlSonos, moveSonos, setSonosVolume, SonosControlError } from "./sonos-control";

function rec(status: number, body?: unknown) {
  const calls: { url: string; method: string; auth: string; body?: string }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), auth: (init.headers as Record<string, string>).Authorization!, ...(init.body ? { body: String(init.body) } : {}) });
    return new Response(JSON.stringify(body ?? {}), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const run = (action: Parameters<typeof controlSonos>[0], groupId: string, f: ReturnType<typeof rec>) => controlSonos(action, groupId, { getToken: async () => "TOK", fetchFn: f.fn });

describe("controlSonos", () => {
  it.each([["play", "play"], ["pause", "pause"], ["next", "skipToNextTrack"], ["previous", "skipToPreviousTrack"]] as const)("%s posts to playback/%s", async (action, path) => {
    const f = rec(200);
    await run(action, "RINCON_1:23", f);
    expect(f.calls).toEqual([{ url: `https://api.ws.sonos.com/control/api/v1/groups/RINCON_1%3A23/playback/${path}`, method: "POST", auth: "Bearer TOK" }]);
  });
  it.each([[401, "reauth"], [404, "gone"], [410, "gone"], [429, "rate_limit"], [500, "failed"], [499, "failed"]])("status %i gives %s", async (status, code) => {
    const e = (await run("play", "G", rec(status)).catch((x) => x)) as SonosControlError;
    expect(e).toBeInstanceOf(SonosControlError);
    expect(e.code).toBe(code);
    expect(e.message).not.toContain("TOK");
  });
  it("network failure gives failed", async () => {
    const e = (await controlSonos("play", "G", { getToken: async () => "TOK", fetchFn: (async () => { throw new Error("x"); }) as unknown as typeof fetch }).catch((x) => x)) as SonosControlError;
    expect(e.code).toBe("failed");
  });
});

describe("setSonosVolume", () => {
  it("posts the group volume", async () => {
    const f = rec(200);
    await setSonosVolume("RINCON_1:23", 35, { getToken: async () => "TOK", fetchFn: f.fn });
    expect(f.calls).toEqual([{ url: "https://api.ws.sonos.com/control/api/v1/groups/RINCON_1%3A23/groupVolume", method: "POST", auth: "Bearer TOK", body: JSON.stringify({ volume: 35 }) }]);
  });
  it("errors map like playback", async () => {
    expect(((await setSonosVolume("G", 1, { getToken: async () => "TOK", fetchFn: rec(404).fn }).catch((x) => x)) as SonosControlError).code).toBe("gone");
  });
});

describe("moveSonos", () => {
  function routes(householdStatus = 200) {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method ?? "GET"), ...(init.body ? { body: String(init.body) } : {}) });
      if (url.endsWith("/households")) return new Response(JSON.stringify({ households: [{ id: "HH 1" }] }), { status: householdStatus });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }
  it("creates a group with the target player that takes over the music of the old group", async () => {
    const f = routes();
    await moveSonos("RINCON_KOK:1", "RINCON_VR", { getToken: async () => "TOK", fetchFn: f.fn });
    expect(f.calls).toEqual([
      { url: "https://api.ws.sonos.com/control/api/v1/households", method: "GET" },
      { url: "https://api.ws.sonos.com/control/api/v1/households/HH%201/groups/createGroup", method: "POST", body: JSON.stringify({ playerIds: ["RINCON_VR"], musicContextGroupId: "RINCON_KOK:1" }) },
    ]);
  });
  it("household failure gives an error and no move", async () => {
    const f = routes(401);
    expect(((await moveSonos("G", "P", { getToken: async () => "TOK", fetchFn: f.fn }).catch((x) => x)) as SonosControlError).code).toBe("reauth");
    expect(f.calls).toHaveLength(1);
  });
});
