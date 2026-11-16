import { describe, expect, it } from "vitest";
import { familyBody, loadFamilyAll, saveFamily } from "./family-store";

function fakeDb() {
  const store: Record<string, unknown> = {};
  return { appSetting: { findUnique: async ({ where }: { where: { key: string } }) => (store[where.key] === undefined ? null : { value: store[where.key] }), upsert: async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => { store[where.key] = create.value; return {}; } } } as never;
}

describe("familjen", () => {
  it("godtar nya personer utan id och ger dem id", async () => {
    const body = familyBody.safeParse({ members: [{ name: "Mickael", kind: "adult" }], handover: { weekday: 7, time: "16:30" } });
    expect(body.success).toBe(true);
    const db = fakeDb();
    const saved = await saveFamily([{ name: "Mickael", kind: "adult" }, { id: "", name: "Noah", kind: "child" }, { name: "mickael", kind: "adult" }], { weekday: 1, time: "18:00" }, db);
    expect(saved.members.map((m) => m.name)).toEqual(["Mickael", "Noah"]);
    expect(saved.members.every((m) => m.id.length > 0)).toBe(true);
    expect((await loadFamilyAll(db)).handover).toEqual({ weekday: 1, time: "18:00" });
  });
  it("nekar ogiltig tid och för många personer", () => {
    expect(familyBody.safeParse({ members: [], handover: { weekday: 8, time: "16:30" } }).success).toBe(false);
    expect(familyBody.safeParse({ members: Array.from({ length: 13 }, () => ({ name: "A", kind: "adult" })) }).success).toBe(false);
  });
});
