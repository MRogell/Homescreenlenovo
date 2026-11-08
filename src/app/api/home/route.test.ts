import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/server/authz", () => ({ getSessionUser: async () => user.current }));
vi.mock("@/server/snapshots", () => ({
  getHomeStates: async () => ({ skoda: { status: "ok", data: { rangeKm: 1 }, fetchedAt: "2026-11-07T12:00:00.000Z" }, tapo: { status: "not_connected" } }),
}));

vi.mock("@/server/settings", async () => {
  const { DEFAULT_SETTINGS } = await import("@/lib/settings");
  return { getSettings: async () => ({ ...DEFAULT_SETTINGS, night: { enabled: true, from: "21:00", to: "07:00" } }) };
});

import { GET } from "./route";

beforeEach(() => { user.current = null; });

describe("GET /api/home", () => {
  it("without session is 401 with no body data", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Inte inloggad" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("with session returns states and never tokens", async () => {
    user.current = { id: "u1" };
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/token/i);
    expect(JSON.parse(text).states.skoda.status).toBe("ok");
  });
  it("includes the settings so a change on one device reaches the others", async () => {
    user.current = { id: "u1" };
    const body = await (await GET()).json();
    expect(body.settings.night).toEqual({ enabled: true, from: "21:00", to: "07:00" });
    expect(body.settings.cards.order).toHaveLength(6);
  });
});
