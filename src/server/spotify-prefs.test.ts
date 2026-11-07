import { beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "./db";
import { getSpotifyDefaultDevice, handleSetDefault, type SetDefaultRequest } from "./spotify-prefs";

const db = createPrisma(process.env.DATABASE_URL);
const ok: SetDefaultRequest = { body: { deviceId: "PHONE1", name: "iPhone" }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };

beforeEach(async () => {
  await db.connection.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
  await db.user.create({ data: { id: "u1", name: "T", email: "t@example.com" } });
  await db.connection.create({ data: { userId: "u1", provider: "spotify", tokenEnc: "x" } });
});

describe("spotify default device", () => {
  it("is null until set", async () => expect(await getSpotifyDefaultDevice(db)).toBeNull());
  it("set stores id and trimmed name; get returns it", async () => {
    expect((await handleSetDefault({ ...ok, body: { deviceId: "PHONE1", name: "  iPhone  " } }, { db })).status).toBe(204);
    expect(await getSpotifyDefaultDevice(db)).toEqual({ id: "PHONE1", name: "iPhone" });
  });
  it("set keeps other settings", async () => {
    await db.connection.updateMany({ data: { settings: { annat: 1 } } });
    await handleSetDefault(ok, { db });
    expect((await db.connection.findFirstOrThrow()).settings).toEqual({ annat: 1, defaultDevice: { id: "PHONE1", name: "iPhone" } });
  });
  it("clear removes it", async () => {
    await handleSetDefault(ok, { db });
    expect((await handleSetDefault({ ...ok, body: { clear: true } }, { db })).status).toBe(204);
    expect(await getSpotifyDefaultDevice(db)).toBeNull();
  });
  it("broken stored settings read as null", async () => {
    await db.connection.updateMany({ data: { settings: { defaultDevice: { id: "../x", name: 5 } } } });
    expect(await getSpotifyDefaultDevice(db)).toBeNull();
  });
  it("without session 401, wrong origin 403, bad body 400", async () => {
    expect((await handleSetDefault({ ...ok, userId: null }, { db })).status).toBe(401);
    expect((await handleSetDefault({ ...ok, origin: "https://ond.example.com" }, { db })).status).toBe(403);
    for (const body of [null, {}, { deviceId: "../x", name: "a" }, { deviceId: "A", name: "" }, { deviceId: "A", name: "x".repeat(101) }, { deviceId: "A" }, { clear: false }, { clear: true, deviceId: "A" }]) {
      expect((await handleSetDefault({ ...ok, body }, { db })).status, JSON.stringify(body)).toBe(400);
    }
    expect(await getSpotifyDefaultDevice(db)).toBeNull();
  });
  it("without a Spotify connection 409", async () => {
    await db.connection.deleteMany();
    const r = await handleSetDefault(ok, { db });
    expect(r.status).toBe(409);
    expect(r.json?.code).toBe("not_connected");
  });
});
