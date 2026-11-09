import { MAX_RECIPE_LINES, MAX_RECIPES, recipeKey, type CustomRecipe } from "./dinner";

/**
 * Inköpslista och lappar: ren logik som delas av servern och webbläsaren.
 * Servern och klienten kör samma `applyOps`, så att det du ser medan du är offline blir exakt det som sparas när du är online igen.
 */

export const CATEGORIES = [
  { id: "frukt", label: "Frukt & grönt" },
  { id: "brod", label: "Bröd & bageri" },
  { id: "mejeri", label: "Mejeri & ägg" },
  { id: "kott", label: "Kött, fisk & chark" },
  { id: "skafferi", label: "Skafferi" },
  { id: "fryst", label: "Fryst" },
  { id: "dryck", label: "Dryck" },
  { id: "fika", label: "Godis & fika" },
  { id: "hushall", label: "Hushåll & hygien" },
  { id: "ovrigt", label: "Övrigt" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];
export const categoryLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? "Övrigt";

// Ordlistor (svenska). Matchar hela ord, ordets slut (sammansättningar: "färskpotatis" → potatis) och ordets början (böjningar: "bananer" → banan).
const WORDS: Record<Exclude<CategoryId, "ovrigt" | "fryst">, string> = {
  frukt: "banan äpple päron apelsin citron lime mandarin clementin druvor vindruvor melon vattenmelon ananas mango avokado kiwi jordgubb hallon blåbär körsbär persika nektarin plommon fikon tomat gurka paprika sallad isbergssallad romansallad spenat ruccola kål broccoli blomkål morot potatis sötpotatis lök rödlök vitlök purjolök sparris squash aubergine svamp champinjon kantarell majs rotfrukt rödbeta selleri fänkål persilja dill basilika koriander mynta gräslök ingefära chili bönor ärtor sockerärtor rädisa pumpa palsternacka kålrot färskpotatis",
  brod: "bröd limpa fralla frallor baguette ciabatta tortilla tunnbröd knäckebröd skorpor kanelbulle bulle bullar croissant wienerbröd tårta kaka bakelse våffla pannkaka naan pitabröd hamburgerbröd korvbröd toast formfranska lövbröd",
  mejeri: "mjölk grädde créme fraiche gräddfil filmjölk yoghurt naturell kvarg keso smör margarin bregott ost hushållsost cheddar mozzarella fetaost parmesan brie philadelphia färskost ägg havregurt havredryck sojadryck mandelmjölk laktosfri matlagningsgrädde vispgrädde turkisk",
  kott: "kött nötfärs färs fläsk fläskfilé kyckling kycklingfilé kalkon biff entrecote oxfilé karré bacon skinka salami korv falukorv prinskorv grillkorv leverpastej pålägg kassler lamm lax torsk sill räkor tonfisk fisk fiskfilé laxfilé pytt skaldjur kaviar ribs revben hamburgare köttbullar",
  skafferi: "pasta spaghetti makaroner penne ris basmatiris couscous bulgur quinoa nudlar havregryn müsli flingor cornflakes gryn mjöl vetemjöl socker florsocker bakpulver jäst kakao olja olivolja rapsolja vinäger ättika salt peppar krydda kryddor kanel vanilj buljong fond tomatpuré krossade passerade konserv burk bönor linser kikärtor kokosmjölk soja sojasås ketchup senap majonnäs dressing sås pesto sylt marmelad honung sirap nutella jordnötssmör mandel nötter russin popcorn hummus tacokrydda tacoskal tacosås salsa wrap lasagneplattor panko",
  dryck: "juice läsk cola fanta sprite sodavatten vatten mineralvatten kolsyrat bubbelvatten öl vin rödvin vitvin bubbel cider saft kaffe te tebag kaffekapslar energidryck proteindryck chokladdryck lättöl alkoholfri",
  fika: "godis lösgodis choklad chokladkaka kex kakor ballerina digestive chips ostbågar lakrits tuggummi pastiller mintkarameller bakverk",
  hushall: "toalettpapper hushållspapper diskmedel maskindiskmedel tvättmedel sköljmedel handtvål tvål schampo balsam duschtvål tandkräm tandborste deodorant rakhyvel rakskum bindor tamponger blöjor våtservetter servetter smink plåster tvättsvamp disktrasa soppåsar påsar fryspåsar bakplåtspapper aluminiumfolie plastfolie batterier glödlampa tändstickar ljus värmeljus städ allrengöring fönsterputs wc-rengöring kattmat hundmat kattsand",
};
const FROZEN = "fryst frysta frysen glass frysk djupfryst pizza frysta pommes pommes-frites fiskpinnar färdigrätt";

const TOKENS = (s: string) => s.toLowerCase().split(/[^a-zåäöéèü0-9-]+/).filter(Boolean);
const INDEX: { word: string; cat: CategoryId }[] = [
  ...FROZEN.split(" ").map((w) => ({ word: w, cat: "fryst" as const })),
  ...(Object.entries(WORDS) as [CategoryId, string][]).flatMap(([cat, list]) => list.split(" ").filter(Boolean).map((word) => ({ word, cat }))),
];

/** Vilken avdelning varan hör till. Längsta träffen vinner ("fryst pizza" blir fryst, inte skafferi). Okänt blir "ovrigt". */
export function categorize(name: string): CategoryId {
  let best: { len: number; cat: CategoryId } | null = null;
  for (const t of TOKENS(name)) {
    for (const { word, cat } of INDEX) {
      const w = word.toLowerCase();
      const hit = t === w || (w.length >= 4 && (t.endsWith(w) || t.startsWith(w)));
      if (hit && (!best || w.length > best.len || (w.length === best.len && cat === "fryst"))) best = { len: w.length, cat };
    }
  }
  return best?.cat ?? "ovrigt";
}

const UNIT = "st|x|kg|g|hg|l|dl|cl|ml|förp|pkt|påse|påsar|burk|burkar|flaska|flaskor|knippe|skiva|skivor|paket";
const QTY_FIRST = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\.?\\s+(.+)$`, "i");
const QTY_LAST = new RegExp(`^(.+?)[\\s,]+(\\d+(?:[.,]\\d+)?\\s*(?:${UNIT})?)\\.?$`, "i");
const X_FIRST = /^(\d+)\s*x\s*(.+)$/i;

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "");

/** "2 mjölk", "mjölk 2 l", "3x ägg", "ägg (12-pack)" → namn och mängd. Mängd saknas ofta, och då är den null. */
export function parseItem(input: string): { name: string; qty: string | null } | null {
  let s = tidy(input);
  if (!s) return null;
  let qty: string | null = null;
  const paren = s.match(/\(([^)]{1,20})\)\s*$/);
  if (paren) { qty = paren[1]!.trim(); s = tidy(s.slice(0, paren.index)); }
  const x = s.match(X_FIRST);
  if (x) { qty = `${x[1]} st`; s = tidy(x[2]!); }
  else {
    const f = s.match(QTY_FIRST);
    if (f) { qty = tidy(`${f[1]} ${f[2] ?? ""}`).replace(/\s+/g, " "); s = tidy(f[3]!); }
    else {
      const l = s.match(QTY_LAST);
      if (l && !/^\d+$/.test(l[1]!)) { qty = tidy(l[2]!.replace(/\s+/g, " ")); s = tidy(l[1]!); }
    }
  }
  if (!s) return null;
  return { name: cap(s.slice(0, 60)), qty: qty ? qty.slice(0, 20) : null };
}

/** Delar en inmatning i flera varor: radbrytning, semikolon och komma (utom när det som följer bara är en mängd, "mjölk, 2 l"). */
export function splitInput(text: string): string[] {
  const qtyOnly = new RegExp(`^\\s*\\d+(?:[.,]\\d+)?\\s*(?:${UNIT})?\\s*$`, "i");
  const out: string[] = [];
  for (const line of text.split(/[\n;]/)) {
    let cur = "";
    for (const part of line.split(",")) {
      if (cur && qtyOnly.test(part)) cur += `,${part}`;
      else { if (cur) out.push(cur); cur = part; }
    }
    if (cur) out.push(cur);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

/** Jämförelsenyckel: samma vara oavsett versaler och mellanslag. */
export const itemKey = (name: string) => tidy(name).toLowerCase();

// ---------- Tillstånd och operationer ----------

export interface ShopItem {
  id: string; name: string; qty: string | null; category: CategoryId; checked: boolean; at: number; checkedAt: number | null;
  /** Hittades inte i butiken: ligger kvar på listan till nästa gång. */
  skipped?: boolean;
  /** Vem som lade till varan (familjemedlemmens namn). Sätts av servern, aldrig av klienten. */
  by?: string;
}
export interface Note { id: string; text: string; at: number; by?: string }
export interface HistoryEntry { name: string; category: CategoryId; count: number; lastAt: number }
/** En planerad middag. `listed`: ingredienserna har lagts på inköpslistan. */
export interface Dinner { dish: string; by?: string; at: number; listed?: boolean }
export interface ListsState {
  items: ShopItem[]; notes: Note[]; history: Record<string, HistoryEntry>;
  /** Middagar per datum ("YYYY-MM-DD", svensk tid). */
  dinners: Record<string, Dinner>;
  /** Egna recept (nyckel = namnet i gemener). */
  recipes: Record<string, CustomRecipe>;
  /** Återkommande middagar: veckodag (1–7) till rätt, som föreslås varje vecka. */
  habits: Record<string, string>;
  /** Antal personer som mängderna räknas för. */
  people: number;
}

export const MAX_ITEMS = 300;
export const MAX_NOTES = 30;
export const MAX_HISTORY = 400;
export const MAX_DINNERS = 60;
export const MAX_PEOPLE = 12;
export const DEFAULT_PEOPLE = 4;
export const EMPTY_LISTS: ListsState = { items: [], notes: [], history: {}, dinners: {}, recipes: {}, habits: {}, people: DEFAULT_PEOPLE };

export type Op =
  | { op: "add"; id: string; name: string; qty?: string | null; at: number; by?: string }
  | { op: "check"; id: string; checked: boolean; at: number }
  | { op: "skip"; id: string; skipped: boolean }
  | { op: "remove"; id: string }
  | { op: "setQty"; id: string; qty: string | null }
  | { op: "clearChecked" }
  | { op: "noteAdd"; id: string; text: string; at: number; by?: string }
  | { op: "noteRemove"; id: string }
  | { op: "dinner"; date: string; dish: string; at: number; by?: string }
  | { op: "dinnerListed"; dates: string[] }
  | { op: "habit"; weekday: number; dish: string | null }
  | { op: "people"; n: number }
  | { op: "recipe"; name: string; ingredients: string[] }
  | { op: "recipeRemove"; name: string };

/** Tillämpar operationer på ett tillstånd och ger ett nytt (indata ändras aldrig). Operationer som inte går att utföra hoppas över. */
export function applyOps(state: ListsState, ops: readonly Op[]): ListsState {
  let items = [...state.items];
  let notes = [...state.notes];
  const history = { ...state.history };
  let dinners = { ...state.dinners };
  let recipes = { ...state.recipes };
  let habits = { ...state.habits };
  let people = state.people;
  for (const o of ops) {
    switch (o.op) {
      case "add": {
        const parsed = parseItem(o.qty ? `${o.name} (${o.qty})` : o.name);
        if (!parsed || items.some((i) => i.id === o.id) || items.length >= MAX_ITEMS) break;
        const key = itemKey(parsed.name);
        const same = items.find((i) => itemKey(i.name) === key);
        if (same) {
          // Samma vara finns redan: ny mängd om den saknade en, och avbockad vara hamnar på listan igen.
          items = items.map((i) => (i.id === same.id ? { ...i, checked: false, checkedAt: null, skipped: false, qty: i.qty ?? parsed.qty } : i));
          break;
        }
        const h = history[key];
        items.push({ id: o.id, name: parsed.name, qty: parsed.qty, category: h?.category ?? categorize(parsed.name), checked: false, at: o.at, checkedAt: null, ...(o.by ? { by: o.by.slice(0, 24) } : {}) });
        if (!h && Object.keys(history).length < MAX_HISTORY) history[key] = { name: parsed.name, category: categorize(parsed.name), count: 0, lastAt: o.at };
        break;
      }
      case "check": {
        const it = items.find((i) => i.id === o.id);
        if (!it) break;
        items = items.map((i) => (i.id === o.id ? { ...i, checked: o.checked, checkedAt: o.checked ? o.at : null, skipped: false } : i));
        const key = itemKey(it.name);
        if (o.checked && !it.checked) {
          const h = history[key];
          history[key] = { name: it.name, category: it.category, count: (h?.count ?? 0) + 1, lastAt: o.at };
        }
        break;
      }
      case "skip": items = items.map((i) => (i.id === o.id && !i.checked ? { ...i, skipped: o.skipped } : i)); break;
      case "remove": items = items.filter((i) => i.id !== o.id); break;
      case "setQty": items = items.map((i) => (i.id === o.id ? { ...i, qty: o.qty ? o.qty.slice(0, 20) : null } : i)); break;
      case "clearChecked": items = items.filter((i) => !i.checked); break;
      case "noteAdd": {
        const text = tidy(o.text).slice(0, 280);
        if (!text || notes.some((n) => n.id === o.id) || notes.length >= MAX_NOTES) break;
        notes = [{ id: o.id, text, at: o.at, ...(o.by ? { by: o.by.slice(0, 24) } : {}) }, ...notes];
        break;
      }
      case "noteRemove": notes = notes.filter((n) => n.id !== o.id); break;
      case "dinner": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) break;
        const dish = tidy(o.dish).slice(0, 60);
        if (!dish) { const { [o.date]: _gone, ...rest } = dinners; void _gone; dinners = rest; break; }
        if (!dinners[o.date] && Object.keys(dinners).length >= MAX_DINNERS) break;
        // Ny eller ändrad rätt: ingredienserna är inte på listan än.
        dinners = { ...dinners, [o.date]: { dish, at: o.at, ...(o.by ? { by: o.by.slice(0, 24) } : {}) } };
        break;
      }
      case "dinnerListed": {
        for (const d of o.dates) if (dinners[d]) dinners = { ...dinners, [d]: { ...dinners[d]!, listed: true } };
        break;
      }
      case "habit": {
        if (!Number.isInteger(o.weekday) || o.weekday < 1 || o.weekday > 7) break;
        const dish = o.dish ? tidy(o.dish).slice(0, 60) : "";
        if (!dish) { const { [String(o.weekday)]: _gone, ...rest } = habits; void _gone; habits = rest; } else habits = { ...habits, [String(o.weekday)]: dish };
        break;
      }
      case "people": if (Number.isInteger(o.n) && o.n >= 1 && o.n <= MAX_PEOPLE) people = o.n; break;
      case "recipe": {
        const name = tidy(o.name).slice(0, 60);
        const lines = o.ingredients.map((l) => tidy(l).slice(0, 60)).filter(Boolean).slice(0, MAX_RECIPE_LINES);
        if (!name || lines.length === 0) break;
        const key = recipeKey(name);
        if (!recipes[key] && Object.keys(recipes).length >= MAX_RECIPES) break;
        recipes = { ...recipes, [key]: { name, ingredients: lines } };
        break;
      }
      case "recipeRemove": { const { [recipeKey(o.name)]: _gone, ...rest } = recipes; void _gone; recipes = rest; break; }
    }
  }
  return { items, notes, history, dinners, recipes, habits, people };
}

/** Varor att visa: de som ska handlas grupperade i butikens ordning, och sist de avbockade. */
export function groupItems(items: readonly ShopItem[], opts: { withSkipped?: boolean } = {}): { id: CategoryId; label: string; items: ShopItem[] }[] {
  const open = items.filter((i) => !i.checked && (opts.withSkipped !== false || !i.skipped));
  return CATEGORIES.map((c) => ({ id: c.id, label: c.label, items: open.filter((i) => i.category === c.id).sort((a, b) => a.at - b.at) })).filter((g) => g.items.length > 0);
}
/** Varor som inte hittades. De ligger kvar på listan. */
export const skippedItems = (items: readonly ShopItem[]) => items.filter((i) => i.skipped && !i.checked);
export const doneItems = (items: readonly ShopItem[]) => items.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0));

/** Förslag: det ni köper oftast och inte redan har på listan. */
export function suggestions(state: ListsState, limit = 10): string[] {
  const onList = new Set(state.items.filter((i) => !i.checked).map((i) => itemKey(i.name)));
  return Object.entries(state.history)
    .filter(([k, h]) => h.count > 0 && !onList.has(k))
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt)
    .slice(0, limit)
    .map(([, h]) => h.name);
}

/** Namn att fylla i medan man skriver: tidigare varor som börjar på (eller innehåller) det som skrivits. */
export function autocomplete(state: ListsState, typed: string, limit = 5): string[] {
  const q = itemKey(typed);
  if (q.length < 1) return [];
  const onList = new Set(state.items.filter((i) => !i.checked).map((i) => itemKey(i.name)));
  return Object.entries(state.history)
    .filter(([k]) => !onList.has(k) && (k.startsWith(q) || k.split(" ").some((w) => w.startsWith(q))) && k !== q)
    .sort((a, b) => Number(b[0].startsWith(q)) - Number(a[0].startsWith(q)) || b[1].count - a[1].count)
    .slice(0, limit)
    .map(([, h]) => h.name);
}

/** Det som lagras och skickas: tillståndet utan onödig historik. */
export function pruneHistory(h: Record<string, HistoryEntry>): Record<string, HistoryEntry> {
  const e = Object.entries(h);
  if (e.length <= MAX_HISTORY) return h;
  return Object.fromEntries(e.sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt).slice(0, MAX_HISTORY));
}
