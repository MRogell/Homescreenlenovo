import { describe, expect, it } from "vitest";
import { applyOps, autocomplete, categorize, doneItems, EMPTY_LISTS, groupItems, itemKey, MAX_ITEMS, parseItem, splitInput, suggestions, type ListsState, type Op } from "./shopping";

const add = (id: string, name: string, at = 1000): Op => ({ op: "add", id, name, at });
const run = (ops: Op[], from: ListsState = EMPTY_LISTS) => applyOps(from, ops);

describe("categorize", () => {
  it.each([
    ["Mjölk", "mejeri"], ["ägg", "mejeri"], ["Bananer", "frukt"], ["Äpplen", "frukt"], ["Färskpotatis", "frukt"], ["Gurka", "frukt"], ["Tomater", "frukt"],
    ["Kycklingfilé", "kott"], ["Nötfärs", "kott"], ["Lax", "kott"], ["Spaghetti", "skafferi"], ["Krossade tomater", "skafferi"], ["Kaffe", "dryck"], ["Rödvin", "dryck"],
    ["Toalettpapper", "hushall"], ["Diskmedel", "hushall"], ["Fryst pizza", "fryst"], ["Glass", "fryst"], ["Frysta ärtor", "fryst"], ["Knäckebröd", "brod"], ["Kanelbullar", "brod"],
    ["Chokladkaka", "fika"], ["Lösgodis", "fika"], ["Batterier", "hushall"], ["Något helt okänt", "ovrigt"],
  ])("%s → %s", (name, cat) => expect(categorize(name)).toBe(cat));
  it("tom text är övrigt", () => expect(categorize("")).toBe("ovrigt"));
});

describe("parseItem", () => {
  it.each([
    ["mjölk", "Mjölk", null], ["2 mjölk", "Mjölk", "2"], ["2 l mjölk", "Mjölk", "2 l"], ["mjölk 2 l", "Mjölk", "2 l"], ["3x ägg", "Ägg", "3 st"], ["ägg (12-pack)", "Ägg", "12-pack"],
    ["500 g nötfärs", "Nötfärs", "500 g"], ["nötfärs 500g", "Nötfärs", "500g"], ["  bananer  ", "Bananer", null], ["1,5 kg potatis", "Potatis", "1,5 kg"], ["Mjölk, 2 l", "Mjölk", "2 l"],
  ])("%j → %s / %s", (inp, name, qty) => expect(parseItem(inp)).toEqual({ name, qty }));
  it("tom eller bara siffror ger inget", () => {
    expect(parseItem("")).toBeNull();
    expect(parseItem("   ")).toBeNull();
    expect(parseItem("5")?.name).toBe("5");
  });
  it("kapar långa namn och mängder", () => {
    expect(parseItem("x".repeat(100))?.name).toHaveLength(60);
    expect(parseItem(`ägg (${"1".repeat(40)})`)?.qty).toBeNull();
  });
});

describe("splitInput", () => {
  it("delar på komma, radbrytning och semikolon", () => {
    expect(splitInput("mjölk, ägg, bröd")).toEqual(["mjölk", "ägg", "bröd"]);
    expect(splitInput("mjölk\nägg;bröd")).toEqual(["mjölk", "ägg", "bröd"]);
  });
  it("behåller mängd efter komma", () => {
    expect(splitInput("mjölk, 2 l, ägg, 12 st")).toEqual(["mjölk, 2 l", "ägg, 12 st"]);
    expect(splitInput("tomater, 4, gurka")).toEqual(["tomater, 4", "gurka"]);
  });
  it("ignorerar tomma delar", () => expect(splitInput(" , ;\n ")).toEqual([]));
});

describe("applyOps: varor", () => {
  it("lägger till med avdelning och mängd", () => {
    const s = run([{ op: "add", id: "a", name: "mjölk", qty: "2 l", at: 5 }]);
    expect(s.items).toEqual([{ id: "a", name: "Mjölk", qty: "2 l", category: "mejeri", checked: false, at: 5, checkedAt: null }]);
    expect(s.history[itemKey("Mjölk")]).toMatchObject({ name: "Mjölk", count: 0 });
  });
  it("samma vara en gång till läggs inte dubbelt", () => {
    const s = run([add("a", "Mjölk"), add("b", "mjölk")]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.id).toBe("a");
  });
  it("avbockad vara som läggs till igen hamnar på listan", () => {
    const s = run([add("a", "Mjölk"), { op: "check", id: "a", checked: true, at: 2 }, add("b", "Mjölk")]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ checked: false, checkedAt: null });
  });
  it("samma id två gånger (återsänd operation) ger en vara", () => {
    const op = add("a", "Mjölk");
    expect(run([op, op]).items).toHaveLength(1);
    expect(run([op], run([op])).items).toHaveLength(1);
  });
  it("tomt namn ignoreras", () => expect(run([add("a", "  ")]).items).toEqual([]));
  it("bockar av och på, och räknar historik bara första gången", () => {
    let s = run([add("a", "Mjölk"), { op: "check", id: "a", checked: true, at: 9 }]);
    expect(s.items[0]).toMatchObject({ checked: true, checkedAt: 9 });
    expect(s.history[itemKey("Mjölk")]!.count).toBe(1);
    s = run([{ op: "check", id: "a", checked: true, at: 10 }], s);
    expect(s.history[itemKey("Mjölk")]!.count).toBe(1);
    s = run([{ op: "check", id: "a", checked: false, at: 11 }, { op: "check", id: "a", checked: true, at: 12 }], s);
    expect(s.history[itemKey("Mjölk")]!.count).toBe(2);
  });
  it("tar bort, ändrar mängd och rensar avbockade", () => {
    let s = run([add("a", "Mjölk"), add("b", "Ägg"), add("c", "Bröd"), { op: "check", id: "b", checked: true, at: 3 }]);
    s = run([{ op: "setQty", id: "a", qty: "3 l" }, { op: "remove", id: "c" }], s);
    expect(s.items.map((i) => [i.name, i.qty])).toEqual([["Mjölk", "3 l"], ["Ägg", null]]);
    s = run([{ op: "clearChecked" }], s);
    expect(s.items.map((i) => i.name)).toEqual(["Mjölk"]);
  });
  it("okända id:n gör ingenting och indata ändras aldrig", () => {
    const before = run([add("a", "Mjölk")]);
    const snapshot = JSON.stringify(before);
    const after = run([{ op: "check", id: "nope", checked: true, at: 1 }, { op: "remove", id: "nope" }, { op: "setQty", id: "nope", qty: "1" }], before);
    expect(after.items).toEqual(before.items);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
  it("högst 300 varor", () => {
    const A = "abcdefghijklmnopqrstuvwxyz";
    const letters = (n: number) => `${A[Math.floor(n / 26)]}${A[n % 26]}`;
    const ops = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => add(`i${i}`, `Sak ${letters(i)}`));
    expect(run(ops).items).toHaveLength(MAX_ITEMS);
  });
  it("minns avdelningen från historiken", () => {
    const base: ListsState = { items: [], notes: [], history: { [itemKey("Pesto")]: { name: "Pesto", category: "kott", count: 2, lastAt: 1 } } };
    expect(run([add("a", "pesto")], base).items[0]!.category).toBe("kott");
  });
});

describe("applyOps: lappar", () => {
  it("nyast först, kapar text, ignorerar tomma och dubbla id", () => {
    const s = run([{ op: "noteAdd", id: "n1", text: "Ring tandläkaren", at: 1 }, { op: "noteAdd", id: "n2", text: "  ", at: 2 }, { op: "noteAdd", id: "n3", text: "x".repeat(400), at: 3 }, { op: "noteAdd", id: "n1", text: "igen", at: 4 }]);
    expect(s.notes.map((n) => n.id)).toEqual(["n3", "n1"]);
    expect(s.notes[0]!.text).toHaveLength(280);
  });
  it("tar bort en lapp", () => {
    const s = run([{ op: "noteAdd", id: "n1", text: "a", at: 1 }, { op: "noteAdd", id: "n2", text: "b", at: 2 }, { op: "noteRemove", id: "n1" }]);
    expect(s.notes.map((n) => n.id)).toEqual(["n2"]);
  });
  it("högst 30 lappar", () => {
    const s = run(Array.from({ length: 35 }, (_, i) => ({ op: "noteAdd", id: `n${i}`, text: `l${i}`, at: i }) as Op));
    expect(s.notes).toHaveLength(30);
  });
});

describe("visning och förslag", () => {
  const s = run([add("a", "Banan", 1), add("b", "Mjölk", 2), add("c", "Tvål", 3), add("d", "Äpple", 4), { op: "check", id: "b", checked: true, at: 50 }]);
  it("grupperar i butikens ordning med äldst först, avbockat för sig", () => {
    expect(groupItems(s.items).map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([["Frukt & grönt", ["Banan", "Äpple"]], ["Hushåll & hygien", ["Tvål"]]]);
    expect(doneItems(s.items).map((i) => i.name)).toEqual(["Mjölk"]);
  });
  it("föreslår vanliga varor som inte redan är på listan", () => {
    expect(suggestions(s)).toEqual(["Mjölk"]);
    const again = run([add("e", "Mjölk", 60)], s);
    expect(suggestions(again)).toEqual([]);
  });
  it("sorterar förslag efter antal köp", () => {
    const h: ListsState = { items: [], notes: [], history: { a: { name: "A", category: "ovrigt", count: 1, lastAt: 9 }, b: { name: "B", category: "ovrigt", count: 5, lastAt: 1 }, c: { name: "C", category: "ovrigt", count: 0, lastAt: 99 } } };
    expect(suggestions(h)).toEqual(["B", "A"]);
    expect(suggestions(h, 1)).toEqual(["B"]);
  });
  it("fyller i från historiken medan man skriver", () => {
    const h = run([add("a", "Mjölk"), add("b", "Mozzarella"), add("c", "Havremjölk")]);
    const done = applyOps(h, [{ op: "clearChecked" }]);
    const hist: ListsState = { ...done, items: [] };
    expect(autocomplete(hist, "mj")).toEqual(["Mjölk"]);
    expect(autocomplete(hist, "mo")).toEqual(["Mozzarella"]);
    expect(autocomplete(hist, "")).toEqual([]);
    expect(autocomplete(hist, "mjölk")).toEqual([]);
  });
});
