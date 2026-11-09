import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrisma } from "./db";
import { aegSchema } from "./providers/schemas";
import type { Provider } from "./providers/types";

const dispatch = vi.fn(async () => {});
vi.mock("./notify/push", () => ({ dispatchEvents: (...a: unknown[]) => (dispatch as (...x: unknown[]) => Promise<void>)(...a) }));
import { getHomeStates } from "./snapshots";

const db = createPrisma(process.env.DATABASE_URL);
const T0 = new Date("2026-11-09T09:00:00.000Z");
const wash = (state: string) => aegSchema.parse({ appliance: "Diskmaskin", state, stateText: state, program: null, phase: null, minutesLeft: null, doneAt: null, connected: true, remoteControl: null });
const prov = (state: string): Provider<unknown> => ({ id: "aeg", ttlSeconds: 30, schema: aegSchema, getSummary: async () => wash(state) });

beforeEach(async () => { dispatch.mockClear(); await db.snapshot.deleteMany(); await db.providerBackoff.deleteMany(); });

describe("notiser vid hämtning", () => {
  it("en förändring mellan två hämtningar skickas vidare", async () => {
    await db.snapshot.create({ data: { provider: "aeg", payload: wash("RUNNING") as never, fetchedAt: new Date(T0.getTime() - 60_000) } });
    await getHomeStates(T0, [prov("END_OF_CYCLE")], db);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0] as unknown[])[0]).toMatchObject([{ kind: "aegDone" }]);
  });
  it("ingen förändring, ingen notis; färsk cache hämtar inget", async () => {
    await db.snapshot.create({ data: { provider: "aeg", payload: wash("RUNNING") as never, fetchedAt: new Date(T0.getTime() - 60_000) } });
    await getHomeStates(T0, [prov("RUNNING")], db);
    expect(dispatch).not.toHaveBeenCalled();
    await getHomeStates(new Date(T0.getTime() + 1000), [prov("END_OF_CYCLE")], db);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("första hämtningen ger ingen notis", async () => {
    await getHomeStates(T0, [prov("END_OF_CYCLE")], db);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
