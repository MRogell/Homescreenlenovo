import { aegSchema, skodaSchema } from "../providers/schemas";
import { addLocalDays, DEFAULT_TZ, localDate, startOfLocalDay } from "../calendar/time";
import type { NotifyKind } from "@/lib/settings";

export interface NotifyEvent {
  kind: NotifyKind;
  /** Unik per händelse. Två enheter som upptäcker samma händelse får samma nyckel, så den skickas bara en gång. */
  key: string;
  title: string;
  body: string;
}

export interface Seen { data: unknown; fetchedAt: Date }

/** Är den förra mätningen äldre än så (t.ex. plattan har varit avstängd) vet vi inte när det hände, och en sen notis vilseleder. */
export const MAX_GAP_MS = 2 * 3_600_000;

const hourIn = (d: Date): number => Number(new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", hour12: false, timeZone: DEFAULT_TZ }).format(d)) % 24;

/** Natt = 22:00–06:00 svensk tid. Ger nattens datum (den kväll natten började), eller null om det inte är natt. */
export function nightOf(now: Date): string | null {
  const h = hourIn(now);
  if (h >= 22) return localDate(now);
  if (h < 6) return localDate(addLocalDays(startOfLocalDay(now), -1));
  return null;
}

function aeg(prev: Seen, next: unknown): NotifyEvent[] {
  const a = aegSchema.safeParse(prev.data), b = aegSchema.safeParse(next);
  if (!a.success || !b.success) return [];
  if (b.data.state !== "END_OF_CYCLE" || a.data.state === "END_OF_CYCLE") return [];
  return [{ kind: "aegDone", key: `aeg_done:${prev.fetchedAt.toISOString()}`, title: `${b.data.appliance} är klar`, body: a.data.program ? `${a.data.program} är färdigt.` : "Programmet är färdigt." }];
}

function skoda(prev: Seen | undefined, next: unknown, now: Date): NotifyEvent[] {
  const b = skodaSchema.safeParse(next);
  if (!b.success) return [];
  const out: NotifyEvent[] = [];
  const a = prev ? skodaSchema.safeParse(prev.data) : null;
  if (prev && a?.success && a.data.charging && !b.data.charging) {
    const level = b.data.levelPct, target = a.data.chargeTargetPct;
    const cut = level !== null && target !== null && level < target - 2;
    out.push({
      kind: "carCharged",
      key: `car_charged:${prev.fetchedAt.toISOString()}`,
      title: cut ? "Laddningen stoppade" : "Bilen är laddad",
      body: level === null ? "Laddningen är klar." : cut ? `Batteriet är på ${level} % (mål ${target} %).` : `Batteriet är på ${level} %.`,
    });
  }
  const night = nightOf(now);
  if (night && b.data.locked === false && b.data.driving !== true) {
    out.push({ kind: "carUnlockedNight", key: `car_unlocked_night:${night}`, title: "Bilen står olåst", body: "Det är natt och bilen är inte låst." });
  }
  return out;
}

/** Vad som hänt mellan två hämtningar. Första hämtningen (ingen tidigare) och för gamla jämförelser ger inga notiser. */
export function detectEvents(providerId: string, prev: Seen | undefined, next: unknown, now: Date): NotifyEvent[] {
  if (providerId === "skoda") {
    // Olåst-på-natten behöver ingen tidigare mätning; laddningsbytet gör det.
    const fresh = prev && now.getTime() - prev.fetchedAt.getTime() <= MAX_GAP_MS ? prev : undefined;
    return skoda(fresh, next, now);
  }
  if (providerId === "aeg") {
    if (!prev || now.getTime() - prev.fetchedAt.getTime() > MAX_GAP_MS) return [];
    return aeg(prev, next);
  }
  return [];
}
