import { describe, expect, it } from "vitest";
import { applyOps, EMPTY_LISTS } from "@/lib/shopping";
import { createListsProvider } from "./lists";
import { safeSummary } from "./safe";

const state = applyOps(EMPTY_LISTS, [{ op: "add", id: "item-0001", name: "2 mjölk", at: 1 }, { op: "noteAdd", id: "note-0001", text: "Hej", at: 2 }]);

describe("lists provider", () => {
  it("ger hela tillståndet och godkänns av sitt eget schema", async () => {
    const p = createListsProvider({ load: async () => state });
    const r = await safeSummary(p);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.data.items[0]).toMatchObject({ name: "Mjölk", qty: "2", category: "mejeri" });
  });
  it("är alltid ansluten, med kort giltighet", () => {
    const p = createListsProvider({ load: async () => state });
    expect(p.id).toBe("lists");
    expect(p.ttlSeconds).toBeLessThanOrEqual(15);
    expect(p.connected).not.toBe(false);
    expect(p.isConnected).toBeUndefined();
  });
  it("databasfel blir 'ej tillgänglig', inte ett krasch", async () => {
    const p = createListsProvider({ load: async () => { throw new Error("db nere"); } });
    expect((await safeSummary(p)).status).toBe("unavailable");
  });
});
