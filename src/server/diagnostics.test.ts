import { describe, expect, it } from "vitest";
import { diagnoseSonos, diagnoseSpotify, handleDiagnose } from "./diagnostics";
import { ReauthRequired } from "./connections";
import { fakeFetch, type FakeRoute } from "./providers/fake-fetch";

const tok = async () => "TOK";
const names = (d: { steps: { name: string }[] }) => d.steps.map((s) => s.name);

describe("diagnoseSpotify", () => {
  const player = { is_playing: true, device: { name: "WWMIRO" }, item: { name: "Funeral" } };
  const devices = { devices: [{ id: "A", name: "WWMIRO", type: "Computer", is_restricted: false }, { id: "B", name: "Kök", type: "Speaker", is_restricted: true }] };
  const run = (routes: Record<string, FakeRoute>, getToken = tok) => diagnoseSpotify({ getToken, fetchFn: fakeFetch(routes).fn });

  it("all good: token, player and devices are reported with counts", async () => {
    const d = await run({ "/me/player": { body: player }, "/me/player/devices": { body: devices } });
    expect(d.ok).toBe(true);
    expect(d.steps.map((s) => s.ok)).toEqual([true, true, true]);
    expect(d.steps[1]!.detail).toMatch(/WWMIRO/);
    expect(d.steps[2]!.detail).toMatch(/2 enheter/);
    expect(d.steps[2]!.detail).toMatch(/1 styrbar/);
    expect(d.steps[2]!.detail).toMatch(/1 begränsad/);
    expect(d.steps[2]!.detail).toMatch(/Kök/);
  });
  it("204 on the player is fine (nothing active), and zero devices is a hint, not a failure", async () => {
    const d = await run({ "/me/player": { status: 204 }, "/me/player/devices": { body: { devices: [] } } });
    expect(d.ok).toBe(true);
    expect(d.steps[1]!.detail).toMatch(/Ingen enhet är aktiv/);
    expect(d.steps[2]!.detail).toMatch(/Spotify-appen/);
  });
  it("a connection that needs reconnecting stops after the token step", async () => {
    const d = await run({}, async () => { throw new ReauthRequired(); });
    expect(d.ok).toBe(false);
    expect(names(d)).toEqual(["Inloggning"]);
    expect(d.steps[0]!.detail).toMatch(/Anslut igen/);
  });
  it("401, 403 and 429 from Spotify are explained", async () => {
    expect((await run({ "/me/player": { status: 401 } })).steps[1]!.detail).toMatch(/Anslut igen/);
    expect((await run({ "/me/player": { status: 403 } })).steps[1]!.detail).toMatch(/Premium/);
    expect((await run({ "/me/player": { status: 429 } })).steps[1]!.detail).toMatch(/begränsar/);
  });
  it("Spotify unreachable is reported without throwing", async () => {
    const d = await diagnoseSpotify({ getToken: tok, fetchFn: (async () => { throw new Error("hemlig-adress.example"); }) as unknown as typeof fetch });
    expect(d.ok).toBe(false);
    expect(JSON.stringify(d)).not.toContain("hemlig-adress");
    expect(d.steps[1]!.detail).toMatch(/Nådde inte Spotify/);
  });
  it("a failing devices call fails that step but keeps the earlier results", async () => {
    const d = await run({ "/me/player": { body: player }, "/me/player/devices": { status: 500 } });
    expect(d.ok).toBe(false);
    expect(d.steps.map((s) => s.ok)).toEqual([true, true, false]);
  });
  it("never includes the token", async () => {
    expect(JSON.stringify(await run({ "/me/player": { body: player }, "/me/player/devices": { body: devices } }))).not.toContain("TOK");
  });
});

describe("diagnoseSonos", () => {
  const H = "/households";
  const run = (routes: Record<string, FakeRoute>, getToken = tok) => diagnoseSonos({ getToken, fetchFn: fakeFetch(routes).fn });
  it("reports household and room names", async () => {
    const d = await run({ [H]: { body: { households: [{ id: "HH" }] } }, [`${H}/HH/groups`]: { body: { groups: [{ id: "G1", name: "Vardagsrum" }, { id: "G2", name: "Kök" }], players: [] } } });
    expect(d.ok).toBe(true);
    expect(names(d)).toEqual(["Inloggning", "Hushåll", "Rum"]);
    expect(d.steps[2]!.detail).toMatch(/2 rum/);
    expect(d.steps[2]!.detail).toMatch(/Kök/);
  });
  it("401 and no households are explained", async () => {
    expect((await run({ [H]: { status: 401 } })).steps[1]!.detail).toMatch(/Anslut igen/);
    const d = await run({ [H]: { body: { households: [] } } });
    expect(d.ok).toBe(false);
    expect(d.steps[1]!.detail).toMatch(/hushåll/i);
  });
  it("reconnect needed stops after the token step", async () => {
    const d = await run({}, async () => { throw new ReauthRequired(); });
    expect(names(d)).toEqual(["Inloggning"]);
  });
});

describe("handleDiagnose", () => {
  const base = { origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };
  const deps = { getToken: tok, fetchFn: fakeFetch({ "/me/player": { status: 204 }, "/me/player/devices": { body: { devices: [] } } }).fn };
  it("unknown provider 404, no session 401, other origin 403", async () => {
    expect((await handleDiagnose({ ...base, provider: "tado" }, deps)).status).toBe(404);
    expect((await handleDiagnose({ ...base, provider: "spotify", userId: null }, deps)).status).toBe(401);
    expect((await handleDiagnose({ ...base, provider: "spotify", origin: "https://ond.example.com" }, deps)).status).toBe(403);
    expect((await handleDiagnose({ ...base, provider: "spotify", origin: null }, deps)).status).toBe(403);
  });
  it("returns the steps with 200 and makes no Spotify call before the checks pass", async () => {
    const f = fakeFetch({});
    await handleDiagnose({ ...base, provider: "spotify", userId: null }, { getToken: tok, fetchFn: f.fn });
    expect(f.calls).toHaveLength(0);
    const r = await handleDiagnose({ ...base, provider: "spotify" }, deps);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true });
  });
});
