import { aegSchema, arloSchema, plejdSchema, skodaSchema, sonosSchema, spotifySchema, tadoSchema, tapoSchema } from "./schemas";
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
  skoda: def({ id: "skoda", ttlSeconds: 300, schema: skodaSchema, getSummary: async () => ({ rangeKm: 312, batteryPct: 78, locked: true, parked: "hemma" }) }),
  sonos: def({ id: "sonos", ttlSeconds: 15, schema: sonosSchema, getSummary: async () => ({ playing: true, title: "Kvällsmys", room: "Vardagsrum", grouped: ["Köket"], volume: 28, progressPct: 36 }) }),
  spotify: def({ id: "spotify", ttlSeconds: 30, schema: spotifySchema, getSummary: async () => ({ playing: false, title: "Veckans mix", lastPlayedAt: at(18, 51), device: "Sonos Vardagsrum", playlist: "Discover", todayMinutes: 72 }) }),
  plejd: def({ id: "plejd", ttlSeconds: 30, schema: plejdSchema, getSummary: async () => ({ on: 7, total: 23, rooms: [{ name: "Vardagsrum", on: 3 }, { name: "Kök", on: 2 }, { name: "Hall", on: 2 }] }) }),
  tado: def({ id: "tado", ttlSeconds: 120, schema: tadoSchema, getSummary: async () => ({ heating: true, rooms: [{ name: "Vardagsrum", tempC: 21.4, targetC: 21.5 }, { name: "Sovrum", tempC: 18.9, targetC: 18 }, { name: "Kontor", tempC: 20.2, targetC: 20 }] }) }),
  tapo: def({ id: "tapo", ttlSeconds: 60, connected: false, schema: tapoSchema, getSummary: async () => ({ plugsOn: 0, plugsTotal: 0, camerasOnline: 0, camerasTotal: 0 }) }),
  aeg: def({ id: "aeg", ttlSeconds: 60, schema: aegSchema, getSummary: async () => ({ appliance: "Diskmaskin", running: true, program: "Eco", minutesLeft: 42, progressPct: 58, doneAt: at(20, 24) }) }),
  arlo: def({ id: "arlo", ttlSeconds: 60, schema: arloSchema, getSummary: async () => ({ cameras: 4, lastMotionAt: at(14, 32), lastMotionPlace: "Entré" }) }),
} satisfies Record<string, Provider<unknown>>;
