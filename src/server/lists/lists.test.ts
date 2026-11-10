import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_LISTS } from "@/lib/shopping";
import { db } from "../db";
import { applySettingsPatch } from "../settings";
import { handleListsGet, handleListsPost, MAX_OPS, type ListsRequest } from "./flow";
import { loadLists, mutateLists, normalizeLists } from "./store";

const ok: ListsRequest = { body: { ops: [{ op: "add", id: "item-0001", name: "Mjölk", at: 1000 }] }, origin: "https://hem.example.com", host: "hem.example.com", userId: "u1" };
const post = (ops: unknown[], over: Partial<ListsRequest> = {}) => handleListsPost({ ...ok, body: { ops }, ...over }, db);

beforeEach(async () => { await db.appSetting.deleteMany(); await db.snapshot.deleteMany(); await db.providerBackoff.deleteMany(); });

describe("normalizeLists", () => {
  it("skräp ger tom lista och trasiga poster hoppas över", () => {
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(normalizeLists(bad)).toEqual(EMPTY_LISTS);
    const s = normalizeLists({ items: [{ id: "a", name: "Mjölk", category: "mejeri", at: 5 }, { id: "b" }, null, { id: "c", name: "X", category: "finns-inte", checked: true, checkedAt: 7 }], notes: [{ id: "n", text: "hej", at: 1 }, { id: "m" }], history: { a: { name: "A", category: "frukt", count: 2.7, lastAt: 1 }, b: 5 } });
    expect(s.items.map((i) => [i.id, i.category, i.checked, i.checkedAt])).toEqual([["a", "mejeri", false, null], ["c", "ovrigt", true, 7]]);
    expect(s.notes).toHaveLength(1);
    expect(s.history).toEqual({ a: { name: "A", category: "frukt", count: 2, lastAt: 1 } });
  });
  it("middagar, recept, vanor och antal personer: trasigt hoppas över, annars grundvärden", () => {
    const s = normalizeLists({ dinners: { "2026-11-11": { dish: "Tacos", at: 3, by: "Anna", listed: true }, "inte-datum": { dish: "x" }, "2026-11-12": { dish: "" }, "2026-11-13": 5 }, recipes: { a: { name: "Gryta", ingredients: ["Lök", 5, ""] }, b: { name: "Tom", ingredients: [] }, c: 5 }, habits: { "5": "Tacos", "9": "Nej", "2": "" }, people: 20 });
    expect(s.dinners).toEqual({ "2026-11-11": { dish: "Tacos", at: 3, by: "Anna", listed: true } });
    expect(s.recipes).toEqual({ a: { name: "Gryta", ingredients: ["Lök"] } });
    expect(s.habits).toEqual({ "5": "Tacos" });
    expect(s.people).toBe(6);
    expect(normalizeLists({ people: 5, peopleEven: 3 })).toMatchObject({ people: 5, peopleEven: 3 });
    expect(normalizeLists({ people: 5 })).toMatchObject({ people: 6, peopleEven: 2 }); // äldre data: grundinställningen
  });
});

describe("mutateLists: middagar", () => {
  it("märker middagen med namnet och släpper äldre än två veckor", async () => {
    const now = new Date("2026-11-09T09:00:00+01:00").getTime();
    await mutateLists([{ op: "dinner", date: "2026-10-01", dish: "Gammal", at: 1 }, { op: "dinner", date: "2026-11-11", dish: "Tacos", at: 1 }], db, now, "Anna");
    const s = await loadLists(db);
    expect(s.dinners).toEqual({ "2026-11-11": { dish: "Tacos", at: 1, by: "Anna" } });
  });
  it("ingredienser, vana och recept sparas och läses tillbaka", async () => {
    await mutateLists([{ op: "habit", weekday: 5, dish: "Tacos" }, { op: "people", n: 5 }, { op: "recipe", name: "Min gryta", ingredients: ["Lök"] }], db, 100);
    const s = await loadLists(db);
    expect([s.habits, s.people, s.recipes["min gryta"]?.ingredients]).toEqual([{ "5": "Tacos" }, 5, ["Lök"]]);
  });
});

describe("mutateLists: vem hämtar", () => {
  it("sparas med namnet på den som satte det, och gamla dagar rensas", async () => {
    const now = new Date("2026-11-12T10:00:00+01:00").getTime();
    await mutateLists([{ op: "pickup", date: "2026-10-01", who: "Gammal", at: 1 }, { op: "pickup", date: "2026-11-12", who: "Mamma", at: 1 }], db, now, "Anna");
    expect((await loadLists(db)).pickups).toEqual({ "2026-11-12": { who: "Mamma", at: 1, by: "Anna" } });
  });
  it("kommer med i strikt indata och avvisas om det är fel", async () => {
    const ok = await handleListsPost({ userId: "u", origin: "http://x", host: "x", body: { ops: [{ op: "pickup", date: "2026-11-12", who: "Mamma", at: 1 }] } }, db);
    expect(ok.status).toBe(200);
    for (const bad of [{ op: "pickup", date: "i morgon", who: "A", at: 1 }, { op: "pickup", date: "2026-11-12", who: "A", at: 1, extra: 1 }]) {
      expect((await handleListsPost({ userId: "u", origin: "http://x", host: "x", body: { ops: [bad] } }, db)).status).toBe(400);
    }
  });
});

describe("mutateLists", () => {
  it("sparar och läser tillbaka", async () => {
    await mutateLists([{ op: "add", id: "item-0001", name: "2 mjölk", at: 5 }], db, 100);
    expect((await loadLists(db)).items).toMatchObject([{ id: "item-0001", name: "Mjölk", qty: "2", category: "mejeri" }]);
  });
  it("samtidiga sparningar från flera enheter går inte förlorade", async () => {
    const names = ["Mjölk", "Ägg", "Bröd", "Smör", "Ost", "Äpplen", "Kaffe", "Pasta", "Ris", "Lax"];
    await Promise.all(names.map((n, i) => mutateLists([{ op: "add", id: `item-${String(i).padStart(4, "0")}`, name: n, at: 1 }], db, 100)));
    expect((await loadLists(db)).items.map((i) => i.name).sort()).toEqual([...names].sort());
  });
  it("tider i framtiden kapas till serverns tid", async () => {
    await mutateLists([{ op: "add", id: "item-0001", name: "Mjölk", at: 9_999_999 }], db, 500);
    expect((await loadLists(db)).items[0]!.at).toBe(500);
  });
});

describe("handleListsGet/Post", () => {
  it("utan session 401, fel eller saknat Origin 403, och inget sparas", async () => {
    expect((await handleListsGet({ userId: null }, db)).status).toBe(401);
    expect((await handleListsPost({ ...ok, userId: null }, db)).status).toBe(401);
    expect((await handleListsPost({ ...ok, origin: "https://ond.example.com" }, db)).status).toBe(403);
    expect((await handleListsPost({ ...ok, origin: null }, db)).status).toBe(403);
    expect((await loadLists(db)).items).toEqual([]);
  });
  it("ogiltig indata är 400 och sparar inget", async () => {
    const good = { op: "add", id: "item-0001", name: "Mjölk", at: 1 };
    for (const ops of [[{ op: "dinner", date: "fre", dish: "Tacos", at: 1 }], [{ op: "dinner", date: "2026-11-11", dish: "Tacos", at: 1, by: "Chefen" }], [{ op: "people", n: 13 }], [{ op: "habit", weekday: 8, dish: null }], [{ op: "recipe", name: "x", ingredients: [] }], [{ op: "dinnerListed", dates: ["i morgon"] }], [{ ...good, extra: 1 }], [{ ...good, id: "x" }], [{ ...good, id: "med mellanslag!" }], [{ ...good, name: "" }], [{ ...good, name: "x".repeat(121) }], [{ op: "okänd" }], [{ op: "check", id: "item-0001" }], Array.from({ length: MAX_OPS + 1 }, () => good), "x"]) {
      expect((await post(ops as unknown[])).status, JSON.stringify(ops).slice(0, 60)).toBe(400);
    }
    expect((await handleListsPost({ ...ok, body: null }, db)).status).toBe(400);
    expect((await handleListsPost({ ...ok, body: { ops: [], extra: 1 } }, db)).status).toBe(400);
    expect((await loadLists(db)).items).toEqual([]);
  });
  it("sparar, svarar med hela listan och tömmer hemskärmens cache", async () => {
    await db.snapshot.create({ data: { provider: "lists", payload: {}, fetchedAt: new Date() } });
    await db.snapshot.create({ data: { provider: "spotify", payload: {}, fetchedAt: new Date() } });
    const r = await post([{ op: "add", id: "item-0001", name: "Mjölk", at: 1 }, { op: "add", id: "item-0002", name: "Bananer", at: 2 }, { op: "check", id: "item-0001", checked: true, at: 3 }, { op: "noteAdd", id: "note-0001", text: "Ring tandläkaren", at: 4 }]);
    expect(r.status).toBe(200);
    expect(r.json.lists!.items.map((i) => [i.name, i.checked])).toEqual([["Mjölk", true], ["Bananer", false]]);
    expect(r.json.lists!.notes.map((n) => n.text)).toEqual(["Ring tandläkaren"]);
    expect(await db.snapshot.count({ where: { provider: "lists" } })).toBe(0);
    expect(await db.snapshot.count({ where: { provider: "spotify" } })).toBe(1);
    expect((await handleListsGet({ userId: "u1" }, db)).json.lists!.items).toHaveLength(2);
  });
  it("samma operation två gånger (återsänd efter nätfel) ger ingen dubblett", async () => {
    const op = { op: "add", id: "item-0001", name: "Mjölk", at: 1 };
    await post([op]);
    await post([op]);
    expect((await loadLists(db)).items).toHaveLength(1);
  });
});

describe("Återställ allt rör inte listor, kalendrar eller push-nycklar", () => {
  it("bara utseendet och notisvalen försvinner", async () => {
    await mutateLists([{ op: "add", id: "item-0001", name: "Mjölk", at: 1 }], db, 10);
    for (const key of ["calendars", "vapid"]) await db.appSetting.create({ data: { key, value: { x: 1 } } });
    await applySettingsPatch({ night: { enabled: true, from: "20:00", to: "05:00" }, notify: { aegDone: false, carCharged: false, carUnlockedNight: true } }, db);
    await applySettingsPatch({ reset: true }, db);
    const keys = (await db.appSetting.findMany()).map((r) => r.key).sort();
    expect(keys).toEqual(["calendars", "lists", "vapid"]);
  });
});
