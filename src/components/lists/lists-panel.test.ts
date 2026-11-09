import { describe, expect, it } from "vitest";
import { applyOps, EMPTY_LISTS } from "@/lib/shopping";
import { listAsText } from "./lists-panel";

describe("listAsText", () => {
  it("grupperar i butikens ordning och tar bara med det som ska handlas", () => {
    const s = applyOps(EMPTY_LISTS, [
      { op: "add", id: "item-0001", name: "Tvål", at: 1 }, { op: "add", id: "item-0002", name: "Bananer", qty: "6 st", at: 2 }, { op: "add", id: "item-0003", name: "Mjölk", at: 3 },
      { op: "check", id: "item-0003", checked: true, at: 4 },
    ]);
    expect(listAsText(s.items.filter((i) => !i.checked))).toBe("Frukt & grönt:\n• Bananer (6 st)\n\nHushåll & hygien:\n• Tvål");
  });
  it("tom lista ger tom text", () => expect(listAsText([])).toBe(""));
});
