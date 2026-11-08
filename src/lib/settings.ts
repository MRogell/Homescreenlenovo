import { z } from "zod";

/** Alla kort i standardordning. Samma lista styr vad som får ordnas och döljas. */
export const CARD_IDS = ["weather", "calendar", "skoda", "spotify", "sonos", "aeg", "tado"] as const;
export type CardId = (typeof CARD_IDS)[number];

export interface AppSettings {
  cards: { order: CardId[]; hidden: CardId[] };
  /** Vald väderplats. null = använd miljövariablerna (reserv). */
  place: { name: string; lat: number; lon: number } | null;
  night: { enabled: boolean; from: string; to: string };
}

export const DEFAULT_SETTINGS: AppSettings = {
  cards: { order: [...CARD_IDS], hidden: [] },
  place: null,
  night: { enabled: false, from: "22:00", to: "06:00" },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const unique = (a: readonly string[]) => new Set(a).size === a.length;
const cardId = z.enum(CARD_IDS);

const placeSchema = z.object({ name: z.string().trim().min(1).max(80), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();
const nightSchema = z.object({ enabled: z.boolean(), from: z.string().regex(TIME), to: z.string().regex(TIME) }).strict();

/** Det som får skickas till /api/settings: en eller flera delar, strikt kontrollerade. */
export const settingsPatchSchema = z
  .object({
    cards: z.object({ order: z.array(cardId).length(CARD_IDS.length).refine(unique), hidden: z.array(cardId).refine(unique) }).strict().optional(),
    place: placeSchema.nullable().optional(),
    night: nightSchema.optional(),
    reset: z.literal(true).optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0);
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Tolerant tolkning av det som ligger i databasen: trasigt eller saknat blir grundvärdet, aldrig ett fel. */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = isRecord(raw) ? raw : {};
  const cards = isRecord(r.cards) ? r.cards : {};
  const known = (v: unknown): CardId[] => [...new Set((Array.isArray(v) ? v : []).filter((x): x is CardId => CARD_IDS.includes(x as CardId)))];
  const order = known(cards.order);
  const place = placeSchema.safeParse(r.place);
  const night = isRecord(r.night) ? r.night : {};
  const time = (v: unknown, fallback: string) => (typeof v === "string" && TIME.test(v) ? v : fallback);
  return {
    cards: { order: [...order, ...CARD_IDS.filter((id) => !order.includes(id))], hidden: known(cards.hidden) },
    place: place.success ? place.data : null,
    night: { enabled: night.enabled === true, from: time(night.from, DEFAULT_SETTINGS.night.from), to: time(night.to, DEFAULT_SETTINGS.night.to) },
  };
}

/** Synliga kort i vald ordning. */
export function resolveCards(s: AppSettings): CardId[] {
  return s.cards.order.filter((id) => !s.cards.hidden.includes(id));
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Är det natt just nu (enhetens lokala tid)? Fönstret får gå över midnatt. Lika från och till räknas som av. */
export function isNight(now: Date, night: AppSettings["night"]): boolean {
  if (!night.enabled) return false;
  const from = minutes(night.from), to = minutes(night.to);
  if (from === to) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** Flyttar ett kort ett steg uppåt (-1) eller nedåt (1). Ger en ny lista; kanten och okända kort ändrar inget. */
export function moveCard(order: readonly CardId[], id: CardId, delta: -1 | 1): CardId[] {
  const next = [...order];
  const i = next.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
