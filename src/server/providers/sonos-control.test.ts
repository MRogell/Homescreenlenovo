import { describe, expect, it } from "vitest";
import { controlSonos, SonosControlError } from "./sonos-control";

function rec(status: number, body?: unknown) {
  const calls: { url: string; method: string; auth: string }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), auth: (init.headers as Record<string, string>).Authorization! });
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
