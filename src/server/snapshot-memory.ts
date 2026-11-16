import "server-only";

/**
 * Minnescache för hemskärmens snapshots (per serverinstans). Skärmen frågar ofta och varje fråga läste en rad per tjänst ur databasen;
 * gratisdatabasen räknar anrop, så färska svar hålls i minnet så länge tjänstens egen giltighetstid (ttl) gäller.
 * Rensas när en tjänsts data ändras här (ny aktivitet, ny anslutning). Avstängd i testkörning.
 */
interface Entry { data: unknown; fetchedAt: Date }
const mem = new Map<string, Entry>();
let on = !process.env.VITEST;

export const setSnapshotMemory = (v: boolean) => { on = v; mem.clear(); };
export const getMemorySnapshot = (provider: string): Entry | undefined => (on ? mem.get(provider) : undefined);
export const putMemorySnapshot = (provider: string, e: Entry) => { if (on) mem.set(provider, e); };
export const forgetSnapshot = (provider?: string) => { if (provider) mem.delete(provider); else mem.clear(); };
