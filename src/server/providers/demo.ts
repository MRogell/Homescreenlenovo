import { aegSchema, arloSchema } from "./schemas";
import type { Provider } from "./types";

/** Bevarar typen per tjänst vid definition; registret hanterar dem som Provider<unknown>. */
function def<T>(p: Provider<T>): Provider<unknown> {
  return p as unknown as Provider<unknown>;
}

/** Demodata (etapp 1). Riktiga integrationer ersätter getSummary per tjänst utan att gränssnittet ändras. */
function at(h: number, m: number): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export const demoProviders = {
  aeg: def({ id: "aeg", ttlSeconds: 60, schema: aegSchema, getSummary: async () => ({ appliance: "Diskmaskin", running: true, program: "Eco", minutesLeft: 42, progressPct: 58, doneAt: at(20, 24) }) }),
  arlo: def({ id: "arlo", ttlSeconds: 60, schema: arloSchema, getSummary: async () => ({ cameras: 4, lastMotionAt: at(14, 32), lastMotionPlace: "Entré" }) }),
} satisfies Record<string, Provider<unknown>>;
