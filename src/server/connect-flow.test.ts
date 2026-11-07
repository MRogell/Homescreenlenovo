import { beforeEach, describe, expect, it } from "vitest";
import type { OAuthConfig } from "@/lib/oauth";
import { createPrisma } from "./db";
import { finishConnect, sameOrigin, startConnect } from "./connect-flow";
import { getConnectionStatus } from "./connections";

const db = createPrisma(process.env.DATABASE_URL);
const cfg: OAuthConfig = { authorizeUrl: "https://a/auth", tokenUrl: "https://a/token", clientId: "i", clientSecret: "s", scope: "x y", redirectUri: "http://127.0.0.1:3000/api/connect/spotify/callback" };

function tokenFetch(status = 200, body: unknown = { access_token: "A", refresh_token: "R", expires_in: 3600 }) {
  let calls = 0;
  const fn = (async () => { calls++; return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { fn, calls: () => calls };
}

beforeEach(async () => {
  await db.connection.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
  await db.user.create({ data: { id: "u1", name: "T", email: "t@example.com" } });
});

describe("startConnect", () => {
  it("returns authorize url with state", () => {
    const r = startConnect("spotify", cfg);
    if ("error" in r) throw new Error("oväntat fel");
    const u = new URL(r.redirectTo);
    expect(u.searchParams.get("state")).toBe(r.state);
    expect(u.searchParams.get("client_id")).toBe("i");
  });
  it("without config returns error", () => {
    expect(startConnect("spotify", null)).toEqual({ error: "saknar-konfiguration" });
  });
});

describe("finishConnect", () => {
  it("missing state is rejected without token call", async () => {
    const f = tokenFetch();
    const r = await finishConnect("spotify", { code: "K" }, "COOKIE", "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toBe("/installningar?tjanst=spotify&fel=ogiltig-state");
    expect(f.calls()).toBe(0);
  });
  it("mismatching state is rejected", async () => {
    const f = tokenFetch();
    const r = await finishConnect("spotify", { code: "K", state: "ANNAN" }, "COOKIE", "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toContain("fel=ogiltig-state");
    expect(f.calls()).toBe(0);
    expect(await getConnectionStatus("spotify", db)).toBe("none");
  });
  it("missing cookie is rejected", async () => {
    const f = tokenFetch();
    const r = await finishConnect("spotify", { code: "K", state: "S" }, undefined, "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toContain("fel=ogiltig-state");
    expect(f.calls()).toBe(0);
  });
  it("error param from provider redirects with fel=avbrutet", async () => {
    const f = tokenFetch();
    const r = await finishConnect("spotify", { error: "access_denied", state: "S" }, "S", "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toBe("/installningar?tjanst=spotify&fel=avbrutet");
    expect(f.calls()).toBe(0);
  });
  it("missing code is rejected", async () => {
    const f = tokenFetch();
    const r = await finishConnect("spotify", { state: "S" }, "S", "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toContain("fel=saknar-kod");
    expect(f.calls()).toBe(0);
  });
  it("valid callback saves tokens and redirects with ok", async () => {
    const f = tokenFetch();
    const r = await finishConnect("spotify", { code: "K", state: "S" }, "S", "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toBe("/installningar?tjanst=spotify&ok=1");
    expect(f.calls()).toBe(1);
    expect(await getConnectionStatus("spotify", db)).toBe("ok");
  });
  it("failed token exchange redirects with fel=misslyckades and saves nothing", async () => {
    const f = tokenFetch(400, { error: "invalid_grant" });
    const r = await finishConnect("spotify", { code: "K", state: "S" }, "S", "u1", { config: cfg, fetchFn: f.fn, db });
    expect(r.redirectTo).toBe("/installningar?tjanst=spotify&fel=misslyckades");
    expect(await getConnectionStatus("spotify", db)).toBe("none");
  });
  it("without config redirects with fel=saknar-konfiguration", async () => {
    const r = await finishConnect("spotify", { code: "K", state: "S" }, "S", "u1", { config: null, db });
    expect(r.redirectTo).toContain("fel=saknar-konfiguration");
  });
});

describe("sameOrigin", () => {
  it("accepts same host", () => expect(sameOrigin("https://hem.onrender.com", "hem.onrender.com")).toBe(true));
  it("rejects other origin", () => expect(sameOrigin("https://ond.example.com", "hem.onrender.com")).toBe(false));
  it("rejects null origin or host", () => {
    expect(sameOrigin(null, "hem.onrender.com")).toBe(false);
    expect(sameOrigin("https://hem.onrender.com", null)).toBe(false);
  });
  it("rejects a malformed origin", () => expect(sameOrigin("inte-en-url", "x")).toBe(false));
  it("rejects look-alike host suffix", () => expect(sameOrigin("https://hem.onrender.com.ond.se", "hem.onrender.com")).toBe(false));
});
