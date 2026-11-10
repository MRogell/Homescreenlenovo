import { addLocalDays, localClock, localDate, startOfLocalDay } from "@/server/calendar/time";

/**
 * Middagsplan: ren logik som delas av servern och webbläsaren. Rätter med ingredienser (inbyggda och egna), tolkning av
 * "tacos ons" och "fredagstacos", och mängder som skalas efter antal personer.
 */

export interface RecipeIngredient {
  name: string;
  /** Mängd per person (i `unit`). Saknas mängd skrivs bara namnet. */
  per?: number;
  unit?: string;
}
export interface Recipe { name: string; aliases: string[]; ingredients: RecipeIngredient[] }

const I = (name: string, per?: number, unit?: string): RecipeIngredient => ({ name, per, unit });

export const BUILTIN_RECIPES: Recipe[] = [
  { name: "Tacos", aliases: ["taco", "tacos"], ingredients: [I("Tacoskal", 3, "st"), I("Nötfärs", 125, "g"), I("Tacokrydda"), I("Gurka"), I("Tomater"), I("Riven ost"), I("Gräddfil"), I("Isbergssallad")] },
  { name: "Pasta bolognese", aliases: ["bolognese", "köttfärssås", "spaghetti", "pasta"], ingredients: [I("Spaghetti", 100, "g"), I("Nötfärs", 125, "g"), I("Krossade tomater"), I("Lök"), I("Vitlök"), I("Morötter"), I("Parmesan")] },
  { name: "Pasta carbonara", aliases: ["carbonara"], ingredients: [I("Spaghetti", 100, "g"), I("Bacon", 50, "g"), I("Ägg"), I("Grädde"), I("Parmesan")] },
  { name: "Korv med mos", aliases: ["korv med mos", "falukorv", "prinskorv", "korv och mos", "korv"], ingredients: [I("Korv", 150, "g"), I("Potatis", 250, "g"), I("Mjölk"), I("Smör"), I("Senap")] },
  { name: "Pannkakor", aliases: ["pannkaka", "pannkakor"], ingredients: [I("Vetemjöl"), I("Mjölk"), I("Ägg"), I("Smör"), I("Sylt"), I("Grädde")] },
  { name: "Lax med potatis", aliases: ["lax", "laxfilé"], ingredients: [I("Laxfilé", 150, "g"), I("Potatis", 250, "g"), I("Citron"), I("Dill"), I("Gräddfil"), I("Gurka")] },
  { name: "Pizza", aliases: ["pizza"], ingredients: [I("Fryst pizza", 1, "st"), I("Ruccola"), I("Tomater")] },
  { name: "Kyckling med ris", aliases: ["kyckling", "kycklingfilé", "kycklingfilé med ris"], ingredients: [I("Kycklingfilé", 150, "g"), I("Ris", 75, "g"), I("Paprika"), I("Grädde"), I("Lök")] },
  { name: "Kycklinggryta", aliases: ["kycklinggryta", "gryta"], ingredients: [I("Kycklingfilé", 150, "g"), I("Kokosmjölk"), I("Currypasta"), I("Ris", 75, "g"), I("Paprika"), I("Lök")] },
  { name: "Köttbullar med potatis", aliases: ["köttbullar", "köttbullar med potatis"], ingredients: [I("Köttbullar", 150, "g"), I("Potatis", 250, "g"), I("Brunsås"), I("Lingonsylt"), I("Grädde")] },
  { name: "Lasagne", aliases: ["lasagne"], ingredients: [I("Lasagneplattor"), I("Nötfärs", 125, "g"), I("Krossade tomater"), I("Ost"), I("Mjölk"), I("Smör"), I("Vetemjöl")] },
  { name: "Soppa", aliases: ["soppa", "grönsakssoppa", "ärtsoppa"], ingredients: [I("Morötter"), I("Potatis"), I("Lök"), I("Buljong"), I("Bröd")] },
  { name: "Fiskpinnar med potatis", aliases: ["fiskpinnar"], ingredients: [I("Fiskpinnar", 4, "st"), I("Potatis", 250, "g"), I("Remoulad"), I("Ärtor")] },
  { name: "Wraps", aliases: ["wrap", "wraps"], ingredients: [I("Tortilla", 2, "st"), I("Kycklingfilé", 120, "g"), I("Sallad"), I("Tomater"), I("Gurka"), I("Dressing")] },
  { name: "Hamburgare", aliases: ["hamburgare", "burgare"], ingredients: [I("Hamburgerbröd", 1, "st"), I("Nötfärs", 125, "g"), I("Ost"), I("Tomater"), I("Sallad"), I("Ketchup")] },
  { name: "Omelett", aliases: ["omelett"], ingredients: [I("Ägg", 3, "st"), I("Skinka"), I("Ost"), I("Gräslök"), I("Bröd")] },
  { name: "Risotto", aliases: ["risotto"], ingredients: [I("Risottoris", 75, "g"), I("Lök"), I("Buljong"), I("Parmesan"), I("Svamp")] },
  { name: "Räksallad", aliases: ["räksallad", "räkor", "skagenröra"], ingredients: [I("Räkor", 150, "g"), I("Sallad"), I("Gurka"), I("Citron"), I("Bröd"), I("Majonnäs")] },
];

export interface CustomRecipe { name: string; ingredients: string[] }
export const MAX_RECIPES = 40;
export const MAX_RECIPE_LINES = 30;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const recipeKey = (name: string) => norm(name).slice(0, 60);

/** "500 g", "12 st", "1,5 kg": mängden för ett antal personer. */
export function scaleQty(ing: RecipeIngredient, people: number): string | null {
  if (!ing.per || !ing.unit) return null;
  const total = ing.per * people;
  if (ing.unit === "g" && total >= 1000) return `${String(Math.round(total / 100) / 10).replace(".", ",")} kg`;
  return `${Math.round(total)} ${ing.unit}`;
}

/** Ingredienserna som text att lägga på listan ("Nötfärs 500 g"). */
export function ingredientLines(recipe: Recipe, people: number): string[] {
  return recipe.ingredients.map((i) => { const q = scaleQty(i, people); return q ? `${i.name} ${q}` : i.name; });
}

/** ISO-veckonummer för ett datum ("YYYY-MM-DD"). */
export function isoWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** Antal personer ett visst datum: udda veckor `odd`, jämna veckor `even`. */
export const peopleFor = (date: string, odd: number, even: number): number => (isoWeek(date) % 2 === 1 ? odd : even);

export interface FoundRecipe { name: string; ingredients: string[]; custom: boolean }

/** Hittar ingredienser till en rätt: egna recept först (exakt namn), sedan de inbyggda (längsta träffande ord vinner). */
export function findRecipe(dish: string, custom: Record<string, CustomRecipe>, people: number): FoundRecipe | null {
  const d = norm(dish);
  if (!d) return null;
  const own = custom[recipeKey(dish)];
  if (own) return { name: own.name, ingredients: own.ingredients, custom: true };
  let best: { len: number; r: Recipe } | null = null;
  for (const r of BUILTIN_RECIPES) {
    if (norm(r.name) === d) { best = { len: 999, r }; break; }
    for (const a of r.aliases) {
      const hit = d === a || new RegExp(`(^|[^a-zåäö])${a}($|[^a-zåäö])`).test(d) || d.endsWith(a) || d.startsWith(a);
      if (hit && (!best || a.length > best.len)) best = { len: a.length, r };
    }
  }
  return best ? { name: best.r.name, ingredients: ingredientLines(best.r, people), custom: false } : null;
}

/**
 * Ingredienser för flera dagar: samma rätt på flera dagar slås ihop med det sammanlagda antalet personer
 * ("Nötfärs 800 g", inte två rader), egna recept (fasta rader) läggs en gång.
 */
export function ingredientsForDays(days: { dish: string; date: string }[], custom: Record<string, CustomRecipe>, odd: number, even: number): string[] {
  const people = new Map<string, number>();
  const out = new Set<string>();
  for (const { dish, date } of days) {
    const f = findRecipe(dish, custom, 1);
    if (!f) continue;
    if (f.custom) { f.ingredients.forEach((l) => out.add(l)); continue; }
    people.set(f.name, (people.get(f.name) ?? 0) + peopleFor(date, odd, even));
  }
  for (const [name, n] of people) {
    const r = BUILTIN_RECIPES.find((x) => x.name === name);
    if (r) ingredientLines(r, n).forEach((l) => out.add(l));
  }
  return [...out];
}

/** Namn att föreslå som rätter: egna först, sedan de inbyggda. */
export function dishNames(custom: Record<string, CustomRecipe>): string[] {
  return [...Object.values(custom).map((c) => c.name), ...BUILTIN_RECIPES.map((r) => r.name)];
}

/** Rader till ett eget recept: en per rad eller kommaseparerat, utan tomma och dubbletter. */
export function parseIngredientText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/\n|;|,(?!\s*\d)/)) {
    const t = part.replace(/\s+/g, " ").trim().slice(0, 60);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out.slice(0, MAX_RECIPE_LINES);
}

// ---------- Datum och tolkning av inmatning ----------

const WEEKDAYS: { n: number; words: string[]; short: string }[] = [
  { n: 1, words: ["måndag", "mån"], short: "Mån" }, { n: 2, words: ["tisdag", "tis"], short: "Tis" }, { n: 3, words: ["onsdag", "ons"], short: "Ons" },
  { n: 4, words: ["torsdag", "tors", "tor"], short: "Tors" }, { n: 5, words: ["fredag", "fre"], short: "Fre" }, { n: 6, words: ["lördag", "lör"], short: "Lör" }, { n: 7, words: ["söndag", "sön"], short: "Sön" },
];
export const weekdayShort = (n: number) => WEEKDAYS[n - 1]?.short ?? "";
export const WEEKDAY_NAMES = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];

/** Datum ("YYYY-MM-DD", svensk tid) n dygn efter ett annat. */
export function addDays(date: string, n: number): string {
  const start = startOfLocalDay(new Date(`${date}T12:00:00Z`));
  return localDate(addLocalDays(start, n));
}
export const weekdayOf = (date: string): number => localClock(new Date(`${date}T12:00:00+01:00`)).weekday;

/** De närmaste sju dygnen, idag först. */
export function nextDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i));
}

export interface ParsedDinner { dish: string; date: string | null; habit: boolean }

const WD_RE = WEEKDAYS.flatMap((w) => w.words).sort((a, b) => b.length - a.length).join("|");
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const dayOfWord = (w: string) => WEEKDAYS.find((x) => x.words.includes(w))!.n;
const nextWeekday = (today: string, weekday: number): string => {
  const diff = (weekday - weekdayOf(today) + 7) % 7;
  return addDays(today, diff);
};

/**
 * "tacos ons", "ons tacos", "tacos på fredag", "tacos varje fredag", "fredagstacos", "idag pasta", "imorgon pizza".
 * Dagen blir närmaste förekomst de kommande sju dygnen (idag räknas). "varje …" och "fredagstacos" betyder en vana.
 */
export function parseDinner(input: string, today: string): ParsedDinner | null {
  let s = norm(input).replace(/\s+/g, " ");
  if (!s) return null;
  let date: string | null = null;
  let habit = false;
  const rel = s.match(/(^| )(idag|i dag|imorgon|i morgon|övermorgon)( |$)/);
  if (rel) {
    date = addDays(today, rel[2] === "övermorgon" ? 2 : rel[2]!.includes("morgon") ? 1 : 0);
    s = s.replace(rel[0], " ");
  }
  // "varje fredag" / "alla fredagar" / "fredagar"
  const every = s.match(new RegExp(`(^| )(?:varje|alla|på) ?(${WD_RE})(?:ar)?( |$)`));
  if (every && /varje|alla/.test(every[0])) { date = nextWeekday(today, dayOfWord(every[2]!)); habit = true; s = s.replace(every[0], " "); }
  // compound: fredagstacos, söndagssteka
  const comp = s.match(new RegExp(`(^| )(${WD_RE})s([a-zåäö]{3,})`));
  if (!date && comp && comp[3]) { date = nextWeekday(today, dayOfWord(comp[2]!)); habit = true; s = s.replace(comp[0], ` ${comp[3]}`); }
  if (!date) {
    const m = s.match(new RegExp(`(^| )(?:på |till )?(${WD_RE})( |$)`));
    if (m) { date = nextWeekday(today, dayOfWord(m[2]!)); s = s.replace(m[0], " "); }
  }
  const dish = s.replace(/\b(till|på|middag)\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!dish) return null;
  return { dish: cap(dish), date, habit };
}

/** Raden på hemskärmen: "Middag idag: Tacos · 4 personer". Null när inget är planerat. */
export function dinnerTodayLine(dinners: Record<string, { dish: string }>, people: number, today: string): string | null {
  const x = dinners[today];
  return x ? `Middag idag: ${x.dish} · ${people} ${people === 1 ? "person" : "personer"}` : null;
}
