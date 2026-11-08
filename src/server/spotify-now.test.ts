import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleSpotifyNow } from "./spotify-now";
import type { Provider } from "./providers/types";

const schema = z.object({ n: z.number() });
const provider = (fn: () => Promise<unknown>, connected = true): Provider<unknown> => ({ id: "spotify", ttlSeconds: 30, schema, isConnected: async () => connected, getSummary: fn as never });

describe("handleSpotifyNow", () => {
  it("without session 401 and no Spotify call", async () => {
    let calls = 0;
    const r = await handleSpotifyNow({ userId: null }, { provider: provider(async () => { calls++; return { n: 1 }; }) });
    expect(r.status).toBe(401);
    expect(calls).toBe(0);
  });
  it("asks Spotify directly (no cache) and returns the card state", async () => {
    let calls = 0;
    const p = provider(async () => { calls++; return { n: calls }; });
    expect((await handleSpotifyNow({ userId: "u1" }, { provider: p })).json).toMatchObject({ state: { status: "ok", data: { n: 1 } } });
    expect((await handleSpotifyNow({ userId: "u1" }, { provider: p })).json).toMatchObject({ state: { status: "ok", data: { n: 2 } } });
  });
  it("errors become an unavailable state, not a crash", async () => {
    const r = await handleSpotifyNow({ userId: "u1" }, { provider: provider(async () => { throw new Error("nere"); }) });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: { status: "unavailable" } });
  });
  it("not connected gives not_connected", async () => {
    expect((await handleSpotifyNow({ userId: "u1" }, { provider: provider(async () => ({ n: 1 }), false) })).json).toEqual({ state: { status: "not_connected" } });
  });
});
