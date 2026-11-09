import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { applySettingsPatch } from "../settings";
import { loadLists } from "../lists/store";
import { handleCreateShare, handleGuestGet, handleGuestPost, handleRemoveShare, type ShareRequest } from "./flow";
import { createShare, findShare, listShares, MAX_SHARES, removeShare } from "./store";

const SECRET = "x".repeat(32);
const deps = { db, secret: SECRET };
const owner: ShareRequest = { body: { name: "Anna" }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };
const guest = (token: string, ops: unknown[], over: Record<string, unknown> = {}) => handleGuestPost({ token, body: { ops }, origin: "https://hem.example.com", host: "hem.example.com", ...over }, deps);
const add = (id: string, name: string) => ({ op: "add", id, name, at: 1 });

beforeEach(async () => { await db.appSetting.deleteMany(); await db.snapshot.deleteMany(); });

describe("delningar (lagring)", () => {
  it("skapar med slumpad 256-bitars nyckel som lagras krypterad", async () => {
    const a = await createShare("Anna", db, SECRET, 10);
    const b = await createShare("Kalle", db, SECRET, 10);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    const raw = JSON.stringify((await db.appSetting.findUnique({ where: { key: "shares" } }))?.value);
    expect(raw).not.toContain(a.token);
    expect((await listShares(db, SECRET)).map((s) => [s.name, s.token])).toEqual([["Anna", a.token], ["Kalle", b.token]]);
  });
  it("namn: trimmas, kapas, får inte vara tomt eller dubbelt (oavsett versaler)", async () => {
    await createShare("  Anna   Lisa ", db, SECRET);
    expect((await listShares(db, SECRET))[0]!.name).toBe("Anna Lisa");
    await expect(createShare("   ", db, SECRET)).rejects.toMatchObject({ code: "name" });
    await expect(createShare("anna lisa", db, SECRET)).rejects.toMatchObject({ code: "duplicate" });
    expect((await createShare("x".repeat(60), db, SECRET)).name).toHaveLength(24);
  });
  it("högst åtta personer, även när flera skapas samtidigt", async () => {
    const r = await Promise.allSettled(Array.from({ length: MAX_SHARES + 4 }, (_, i) => createShare(`Person ${String.fromCharCode(97 + i)}`, db, SECRET)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(MAX_SHARES);
    expect((await listShares(db, SECRET))).toHaveLength(MAX_SHARES);
  });
  it("tar bort, och länken slutar fungera direkt", async () => {
    const a = await createShare("Anna", db, SECRET);
    expect(await findShare(a.token, db, SECRET)).toMatchObject({ name: "Anna" });
    await removeShare(a.id, db);
    expect(await findShare(a.token, db, SECRET)).toBeNull();
  });
  it("okända, för korta eller trasiga nycklar ger ingen träff", async () => {
    const a = await createShare("Anna", db, SECRET);
    for (const t of ["", "kort", "x".repeat(43), a.token.slice(0, -1), `${a.token}x`, a.token.toUpperCase(), "a".repeat(500)]) expect(await findShare(t, db, SECRET)).toBeNull();
    expect(await findShare(a.token, db, SECRET)).not.toBeNull();
  });
  it("senast använd uppdateras högst var tionde minut", async () => {
    const a = await createShare("Anna", db, SECRET, 0);
    await findShare(a.token, db, SECRET, 1_000);
    expect((await listShares(db, SECRET))[0]!.lastUsedAt).toBe(1_000);
    await findShare(a.token, db, SECRET, 2_000);
    expect((await listShares(db, SECRET))[0]!.lastUsedAt).toBe(1_000);
    await findShare(a.token, db, SECRET, 700_000);
    expect((await listShares(db, SECRET))[0]!.lastUsedAt).toBe(700_000);
  });
  it("en annan hemlighet gör nycklarna oläsliga utan att något kraschar", async () => {
    const a = await createShare("Anna", db, SECRET);
    expect(await listShares(db, "y".repeat(32))).toEqual([]);
    expect(await findShare(a.token, db, "y".repeat(32))).toBeNull();
  });
  it("Återställ allt rör inte delningarna", async () => {
    await createShare("Anna", db, SECRET);
    await applySettingsPatch({ reset: true }, db);
    expect(await listShares(db, SECRET)).toHaveLength(1);
  });
});

describe("delningar (ägarens anrop)", () => {
  it("utan session 401, fel Origin 403, ogiltigt 400, inget sparas", async () => {
    expect((await handleCreateShare({ ...owner, userId: null }, deps)).status).toBe(401);
    expect((await handleCreateShare({ ...owner, origin: "https://ond.example.com" }, deps)).status).toBe(403);
    expect((await handleCreateShare({ ...owner, origin: null }, deps)).status).toBe(403);
    for (const body of [null, {}, { name: "" }, { name: "A", extra: 1 }, { name: 5 }]) expect((await handleCreateShare({ ...owner, body }, deps)).status).toBe(400);
    expect((await handleRemoveShare({ ...owner, userId: null }, deps)).status).toBe(401);
    expect(await listShares(db, SECRET)).toEqual([]);
  });
  it("skapar och tar bort, och svarar med listan inklusive nycklar", async () => {
    const c = await handleCreateShare(owner, deps);
    expect(c.status).toBe(200);
    expect(c.json.shares).toHaveLength(1);
    expect((await handleCreateShare(owner, deps)).status).toBe(409);
    const r = await handleRemoveShare({ ...owner, body: { id: c.json.shares![0]!.id } }, deps);
    expect(r.json.shares).toEqual([]);
  });
});

describe("familjemedlemmens anrop", () => {
  it("okänd länk är 404 för både läsning och skrivning, och inget sparas", async () => {
    expect((await handleGuestGet({ token: "x".repeat(43) }, deps)).status).toBe(404);
    expect((await guest("x".repeat(43), [add("item-0001", "Mjölk")])).status).toBe(404);
    expect((await loadLists(db)).items).toEqual([]);
  });
  it("läser listan och får sitt namn", async () => {
    const a = await createShare("Anna", db, SECRET);
    const r = await handleGuestGet({ token: a.token }, deps);
    expect(r).toMatchObject({ status: 200, json: { name: "Anna" } });
  });
  it("fel eller saknat Origin är 403, ogiltig indata 400", async () => {
    const a = await createShare("Anna", db, SECRET);
    expect((await guest(a.token, [add("item-0001", "Mjölk")], { origin: "https://ond.example.com" })).status).toBe(403);
    expect((await guest(a.token, [add("item-0001", "Mjölk")], { origin: null })).status).toBe(403);
    expect((await guest(a.token, [{ ...add("item-0001", "Mjölk"), by: "Chefen" }])).status).toBe(400);
    expect((await guest(a.token, [{ op: "okänd" }])).status).toBe(400);
    expect((await loadLists(db)).items).toEqual([]);
  });
  it("det som läggs till märks med hens namn, och klienten kan inte välja själv", async () => {
    const a = await createShare("Anna", db, SECRET);
    const r = await guest(a.token, [add("item-0001", "Mjölk"), { op: "noteAdd", id: "note-0001", text: "Ring tandläkaren", at: 2 }]);
    expect(r.status).toBe(200);
    expect(r.json.lists!.items[0]).toMatchObject({ name: "Mjölk", by: "Anna" });
    expect(r.json.lists!.notes[0]).toMatchObject({ text: "Ring tandläkaren", by: "Anna" });
  });
  it("delar samma lista med ägaren och med andra medlemmar", async () => {
    const a = await createShare("Anna", db, SECRET);
    const k = await createShare("Kalle", db, SECRET);
    await guest(a.token, [add("item-0001", "Mjölk")]);
    const r = await guest(k.token, [add("item-0002", "Ägg"), { op: "check", id: "item-0001", checked: true, at: 3 }]);
    expect(r.json.lists!.items.map((i) => [i.name, i.by, i.checked])).toEqual([["Mjölk", "Anna", true], ["Ägg", "Kalle", false]]);
    expect((await loadLists(db)).items).toHaveLength(2);
  });
  it("tömmer hemskärmens cache av listorna", async () => {
    const a = await createShare("Anna", db, SECRET);
    await db.snapshot.create({ data: { provider: "lists", payload: {}, fetchedAt: new Date() } });
    await guest(a.token, [add("item-0001", "Mjölk")]);
    expect(await db.snapshot.count({ where: { provider: "lists" } })).toBe(0);
  });
});
