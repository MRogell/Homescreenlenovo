import { CARD_IDS, type CardId } from "./settings";

/** Hemskärmens utseende och ordning för just den här enheten (sparas i enheten, inte på servern). */
export const THEMES = ["standard", "nordljus", "skog", "solnedgang", "neutral"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = { standard: "Standard", nordljus: "Nordljus", skog: "Skog", solnedgang: "Solnedgång", neutral: "Neutral" };
export const DENSITIES = ["compact", "normal", "airy"] as const;
export type Density = (typeof DENSITIES)[number];
export const DENSITY_LABEL: Record<Density, string> = { compact: "Tät", normal: "Normal", airy: "Luftig" };
export const TEXT_SIZES = ["s", "m", "l"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_LABEL: Record<TextSize, string> = { s: "Liten", m: "Normal", l: "Stor" };
export const CARD_SIZES = ["s", "m", "l"] as const;
export type CardSize = (typeof CARD_SIZES)[number];
export const SIZE_LABEL: Record<CardSize, string> = { s: "Liten", m: "Normal", l: "Stor" };

export interface Layout {
  /** Egen ordning (null = serverns ordning från Inställningar). */
  order: CardId[] | null;
  sizes: Partial<Record<CardId, CardSize>>;
  theme: Theme;
  density: Density;
  text: TextSize;
}
export const DEFAULT_LAYOUT: Layout = { order: null, sizes: {}, theme: "standard", density: "normal", text: "m" };
export const LAYOUT_KEY = "hs-layout-v1";

const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Läser ett sparat värde säkert: okända eller trasiga delar byts mot standard. */
export function sanitizeLayout(raw: unknown): Layout {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const order = Array.isArray(r.order) ? r.order.filter((x): x is CardId => isIn(CARD_IDS, x)) : null;
  const seen = new Set<CardId>();
  const clean = order?.filter((x) => !seen.has(x) && seen.add(x)) ?? null;
  const sizes: Layout["sizes"] = {};
  if (r.sizes && typeof r.sizes === "object") for (const [k, v] of Object.entries(r.sizes as Record<string, unknown>)) if (isIn(CARD_IDS, k) && isIn(CARD_SIZES, v) && v !== "m") sizes[k] = v;
  return {
    order: clean && clean.length > 0 ? [...clean, ...CARD_IDS.filter((id) => !clean.includes(id))] : null,
    sizes,
    theme: isIn(THEMES, r.theme) ? r.theme : "standard",
    density: isIn(DENSITIES, r.density) ? r.density : "normal",
    text: isIn(TEXT_SIZES, r.text) ? r.text : "m",
  };
}

/** Den som lämnat standardläget för ordning, storlek, täthet eller text: då räknas inte längre "allt på en skärm" (sidan får rulla). Temat påverkar inte passformen. */
export const isFree = (l: Layout): boolean => l.order !== null || Object.keys(l.sizes).length > 0 || l.density === "airy" || l.text !== "m";

/** Ordningen att visa: egen om den finns, annars serverns. Dolda kort (från Inställningar) tas alltid bort. */
export function orderedCards(l: Layout, serverOrder: readonly CardId[], hidden: readonly CardId[]): CardId[] {
  return (l.order ?? [...serverOrder]).filter((id) => !hidden.includes(id));
}

/** Flyttar ett kort till en annan plats i listan (fler steg än ett är tillåtna, t.ex. vid dra och släpp). */
export function moveTo(order: readonly CardId[], id: CardId, target: CardId): CardId[] {
  if (id === target) return [...order];
  const without = order.filter((x) => x !== id);
  const at = without.indexOf(target);
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  // Dras bakåt hamnar kortet före målet, framåt efter målet.
  without.splice(from < to ? at + 1 : at, 0, id);
  return without;
}

export function stepCard(order: readonly CardId[], id: CardId, delta: -1 | 1): CardId[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Attributen på <html> som CSS använder. */
export function htmlAttrs(l: Layout): Record<string, string | undefined> {
  return { "data-theme": l.theme === "standard" ? undefined : l.theme, "data-density": l.density === "normal" ? undefined : l.density, "data-text": l.text === "m" ? undefined : l.text, "data-free": isFree(l) ? "" : undefined };
}
