"use client";
import { BookOpen, Check, ChevronRight, Minus, Plus, Repeat, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BUILTIN_RECIPES, dishNames, findRecipe, ingredientLines, nextDays, parseDinner, parseIngredientText, weekdayOf, weekdayShort, WEEKDAY_NAMES } from "@/lib/dinner";
import { localClock } from "@/server/calendar/time";
import type { ListsApi } from "./lists-panel";

const todayKey = () => localClock(new Date()).date;
const dayLabel = (date: string, today: string) => {
  if (date === today) return "Idag";
  const w = weekdayShort(weekdayOf(date));
  return `${w} ${Number(date.slice(8))}`;
};

/** Redigerare för en dag: rätt, ingredienser att lägga på listan och om den ska återkomma varje vecka. */
function DayEditor({ api, date, today, onClose }: { api: ListsApi; date: string; today: string; onClose: () => void }) {
  const { state } = api;
  const existing = state.dinners[date];
  const weekday = weekdayOf(date);
  const [dish, setDish] = useState(existing?.dish ?? "");
  const [habit, setHabit] = useState(existing ? state.habits[String(weekday)] === existing.dish : false);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState("");
  const [saveOwn, setSaveOwn] = useState(true);
  const [msg, setMsg] = useState("");
  const id = useId();
  const found = useMemo(() => findRecipe(dish, state.recipes, state.people), [dish, state.recipes, state.people]);
  const lines = found?.ingredients ?? [];
  const chosen = lines.filter((l) => !off.has(l));
  const onList = useMemo(() => new Set(state.items.filter((i) => !i.checked).map((i) => i.name.toLowerCase())), [state.items]);
  const have = (l: string) => onList.has(l.replace(/\s+\d.*$/, "").trim().toLowerCase());
  const suggestions = dishNames(state.recipes).filter((n) => dish.trim() === "" || (n.toLowerCase().includes(dish.trim().toLowerCase()) && n.toLowerCase() !== dish.trim().toLowerCase())).slice(0, 8);

  function persist(addToList: boolean) {
    const d = dish.trim();
    if (!d) { api.setDinner(date, ""); onClose(); return; }
    api.setDinner(date, d);
    api.setHabit(weekday, habit ? d : state.habits[String(weekday)] === d ? null : state.habits[String(weekday)] ?? null);
    let ingredients = chosen;
    const extra = parseIngredientText(own);
    if (!found && extra.length > 0) {
      ingredients = extra;
      if (saveOwn) api.saveRecipe(d, extra);
    }
    if (addToList && ingredients.length > 0) {
      const r = api.addIngredients(ingredients, [date]);
      setMsg(`${r.added.length} ${r.added.length === 1 ? "vara" : "varor"} lades på listan${r.existing.length ? `, ${r.existing.length} fanns redan` : ""}.`);
      setTimeout(onClose, 900);
      return;
    }
    onClose();
  }

  return (
    <div className="sheet-in">
      <header className="sheet-head">
        <h2>{date === today ? "Middag idag" : `Middag ${WEEKDAY_NAMES[weekday - 1]} ${Number(date.slice(8))}`}</h2>
        <button type="button" className="icon-btn" aria-label="Stäng" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <label className="dn-label" htmlFor={id}>Rätt</label>
      <input id={id} className="dn-input" value={dish} onChange={(e) => { setDish(e.target.value); setOff(new Set()); }} placeholder="Till exempel tacos" maxLength={60} autoComplete="off" enterKeyHint="done" />
      {suggestions.length > 0 && (
        <div className="li-chips" aria-label="Förslag på rätter">
          {suggestions.map((n) => <button key={n} type="button" className="li-chip" onClick={() => { setDish(n); setOff(new Set()); }}>{n}</button>)}
        </div>
      )}

      {found ? (
        <>
          <div className="dn-sub"><b>Ingredienser</b><span>{found.custom ? "Ditt recept" : "Inbyggt"} · {state.people} personer</span></div>
          <div className="li-chips" aria-label="Ingredienser att lägga på listan">
            {lines.map((l) => (
              <button key={l} type="button" aria-pressed={!off.has(l)} className={`dn-ing${off.has(l) ? "" : " on"}${have(l) ? " have" : ""}`} onClick={() => setOff((o) => { const n = new Set(o); if (n.has(l)) n.delete(l); else n.add(l); return n; })}>
                {!off.has(l) && <Check aria-hidden="true" />}{l}{have(l) && <small>på listan</small>}
              </button>
            ))}
          </div>
        </>
      ) : dish.trim() ? (
        <>
          <div className="dn-sub"><b>Ingredienser</b><span>Ny rätt</span></div>
          <label className="sr-only" htmlFor={`${id}-own`}>Ingredienser</label>
          <textarea id={`${id}-own`} className="dn-input area" value={own} onChange={(e) => setOwn(e.target.value)} placeholder={"En per rad, till exempel\nNötfärs 500 g\nGurka"} rows={4} />
          <label className="dn-check"><input type="checkbox" checked={saveOwn} onChange={(e) => setSaveOwn(e.target.checked)} /><span>Spara som mitt recept</span></label>
        </>
      ) : null}

      <label className="dn-switch"><span><Repeat aria-hidden="true" />Upprepa varje {WEEKDAY_NAMES[weekday - 1]}<small>Föreslås som en vana varje vecka</small></span><input type="checkbox" role="switch" checked={habit} onChange={(e) => setHabit(e.target.checked)} disabled={!dish.trim()} /></label>

      {msg && <p className="mid small" role="status">{msg}</p>}
      <div className="dep-actions">
        <button type="button" className="sm-btn primary" disabled={!dish.trim()} onClick={() => persist(false)}>Spara</button>
        <button type="button" className="sm-btn" disabled={!dish.trim() || (found ? chosen.length === 0 : parseIngredientText(own).length === 0)} onClick={() => persist(true)}>Spara och lägg på listan</button>
        {existing && <button type="button" className="sm-btn danger-text" onClick={() => { api.setDinner(date, ""); onClose(); }}><Trash2 aria-hidden="true" />Ta bort</button>}
      </div>
    </div>
  );
}

function People({ api }: { api: ListsApi }) {
  const { state } = api;
  return (
    <span className="dn-people" role="group" aria-label="Antal personer">
      <button type="button" aria-label="Färre personer" disabled={state.people <= 1} onClick={() => api.setPeople(state.people - 1)}><Minus aria-hidden="true" /></button>
      <output>{state.people} personer</output>
      <button type="button" aria-label="Fler personer" disabled={state.people >= 12} onClick={() => api.setPeople(state.people + 1)}><Plus aria-hidden="true" /></button>
    </span>
  );
}

/** Egna recept: skapa, ändra och ta bort. De inbyggda kan användas som utgångspunkt. */
function Recipes({ api, onClose }: { api: ListsApi; onClose: () => void }) {
  const { state } = api;
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const id = useId();
  const mine = Object.values(state.recipes).sort((a, b) => a.name.localeCompare(b.name, "sv"));

  const load = (n: string, lines: string[]) => { setName(n); setText(lines.join("\n")); setEditing(true); };
  const save = () => {
    const lines = parseIngredientText(text);
    if (!name.trim() || lines.length === 0) return;
    api.saveRecipe(name.trim(), lines);
    setName(""); setText(""); setEditing(false);
  };

  return (
    <div className="sheet-in">
      <header className="sheet-head">
        <h2>Recept</h2>
        <button type="button" className="icon-btn" aria-label="Stäng" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="dn-sub"><b>Antal personer</b><People api={api} /></div>
      <p className="mid small">Egna recept går före de inbyggda när du skriver samma namn. Mängderna skrivs som du vill ha dem på listan.</p>

      <div className="dn-sub"><b>Mina recept</b><span>{mine.length}</span></div>
      {mine.length === 0 ? <p className="mid small">Inga egna recept än. Skapa ett nedan, eller utgå från en inbyggd rätt.</p> : (
        <ul className="dn-recipes">
          {mine.map((r) => (
            <li key={r.name}>
              <button type="button" className="dn-recipe" onClick={() => load(r.name, r.ingredients)}><span><b>{r.name}</b><small>{r.ingredients.slice(0, 4).join(", ")}{r.ingredients.length > 4 ? "…" : ""}</small></span><ChevronRight aria-hidden="true" /></button>
              <button type="button" className="li-x" aria-label={`Ta bort receptet ${r.name}`} onClick={() => api.removeRecipe(r.name)}><Trash2 aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="dn-form">
        <div className="dn-sub"><b>{editing ? "Ändra recept" : "Nytt recept"}</b>{editing && <button type="button" className="dn-link" onClick={() => { setName(""); setText(""); setEditing(false); }}>Avbryt</button>}</div>
        <label className="sr-only" htmlFor={id}>Namn på receptet</label>
        <input id={id} className="dn-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn, till exempel Mormors gryta" maxLength={60} autoComplete="off" />
        <label className="sr-only" htmlFor={`${id}-t`}>Ingredienser</label>
        <textarea id={`${id}-t`} className="dn-input area" value={text} onChange={(e) => setText(e.target.value)} placeholder={"En ingrediens per rad\nNötkött 600 g\nLök\nMorötter"} rows={6} />
        <button type="button" className="sm-btn primary" disabled={!name.trim() || parseIngredientText(text).length === 0} onClick={save}>{editing ? "Spara ändringen" : "Spara recept"}</button>
      </div>

      <div className="dn-sub"><b>Inbyggda rätter</b><span>Tryck för att utgå från en</span></div>
      <div className="li-chips">
        {BUILTIN_RECIPES.map((r) => <button key={r.name} type="button" className="li-chip" onClick={() => load(`Min ${r.name.toLowerCase()}`, ingredientLines(r, state.people))}>{r.name}</button>)}
      </div>
    </div>
  );
}

/** Fliken "Middag": de närmaste sju dagarna, vanor som föreslås, och en knapp som lägger ingredienserna på inköpslistan. */
export function DinnerTab({ api, compactRows }: { api: ListsApi; compactRows?: number }) {
  const { state } = api;
  const [today, setToday] = useState(todayKey);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [recipes, setRecipes] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);
  const rdlg = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const days = nextDays(today);
  const shown = compactRows ? days.slice(0, compactRows) : days;

  useEffect(() => {
    const t = setInterval(() => setToday(todayKey()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (openDate) dlg.current?.showModal(); }, [openDate]);
  useEffect(() => { if (recipes) rdlg.current?.showModal(); }, [recipes]);

  const pending = days.filter((d) => { const x = state.dinners[d]; return x && !x.listed && findRecipe(x.dish, state.recipes, state.people); });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = parseDinner(text, today);
    if (!p) return;
    const date = p.date ?? days.find((d) => !state.dinners[d]) ?? today;
    api.setDinner(date, p.dish);
    if (p.habit) api.setHabit(weekdayOf(date), p.dish);
    setMsg(`${p.dish} ${date === today ? "idag" : dayLabel(date, today).toLowerCase()}${p.habit ? `, varje ${WEEKDAY_NAMES[weekdayOf(date) - 1]}` : ""}.`);
    setText("");
  }
  function listAll() {
    const lines = [...new Set(pending.flatMap((d) => findRecipe(state.dinners[d]!.dish, state.recipes, state.people)!.ingredients))];
    const r = api.addIngredients(lines, pending);
    setMsg(`${r.added.length} ${r.added.length === 1 ? "vara" : "varor"} lades på listan${r.existing.length ? `, ${r.existing.length} fanns redan` : ""}.`);
  }
  const closeDay = () => { dlg.current?.close(); setOpenDate(null); };
  const closeRecipes = () => { rdlg.current?.close(); setRecipes(false); };

  return (
    <div className="dn">
      <form className="li-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={inputId}>Ny middag</label>
        <input id={inputId} value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} placeholder="Tacos ons, eller fredagstacos" enterKeyHint="done" autoComplete="off" maxLength={80} />
        <button type="submit" className="li-plus" aria-label="Lägg in middag" disabled={!text.trim()}><Plus aria-hidden="true" /></button>
      </form>
      <p className={compactRows ? "sr-only" : "li-msg"} role="status">{msg}</p>

      <ul className="dn-days">
        {shown.map((d) => {
          const x = state.dinners[d];
          const habit = !x ? state.habits[String(weekdayOf(d))] : undefined;
          const isToday = d === today;
          return (
            <li key={d} className={`dn-day${isToday ? " today" : ""}`}>
              <button type="button" className="dn-row" onClick={() => setOpenDate(d)} aria-label={`${dayLabel(d, today)}: ${x ? x.dish : habit ? `förslag ${habit}` : "ingen plan"}. Tryck för att ändra`}>
                <span className="dn-d">{dayLabel(d, today)}</span>
                {x ? (
                  <span className="dn-m"><b>{x.dish}</b>{x.by && <small>{x.by}</small>}</span>
                ) : habit ? (
                  <span className="dn-m ghost"><b>{habit}</b><small><Repeat aria-hidden="true" />varje {WEEKDAY_NAMES[weekdayOf(d) - 1]}</small></span>
                ) : <span className="dn-m empty">Ingen plan</span>}
                {x?.listed && <span className="dn-tag">på listan</span>}
              </button>
              {habit && <button type="button" className="sm-btn dn-accept" onClick={() => api.setDinner(d, habit)}>Lägg in</button>}
            </li>
          );
        })}
      </ul>

      {compactRows ? (
        <div className="dn-bar">
          <button type="button" className="dn-list" disabled={pending.length === 0} onClick={listAll}>
            {msg && pending.length === 0 ? "Klart, på listan" : "Lägg ingredienser på listan"}{pending.length > 0 && <span className="dn-count">{pending.length}</span>}
          </button>
          <button type="button" className="icon-btn dn-recipes-btn" aria-label="Recept och antal personer" onClick={() => setRecipes(true)}><BookOpen aria-hidden="true" /></button>
        </div>
      ) : (
        <>
          <div className="dn-bar">
            <button type="button" className="li-clear" onClick={() => setRecipes(true)}><BookOpen aria-hidden="true" />Recept</button>
            <People api={api} />
          </div>
          <button type="button" className="dn-list" disabled={pending.length === 0} onClick={listAll}>
            Lägg ingredienser på listan{pending.length > 0 && <span className="dn-count">{pending.length} {pending.length === 1 ? "dag" : "dagar"}</span>}
          </button>
        </>
      )}

      <dialog ref={dlg} className="sheet" aria-label="Middag" onClose={() => setOpenDate(null)} onClick={(e) => { if (e.target === dlg.current) closeDay(); }}>
        {openDate && <DayEditor key={openDate} api={api} date={openDate} today={today} onClose={closeDay} />}
      </dialog>
      <dialog ref={rdlg} className="sheet" aria-label="Recept" onClose={() => setRecipes(false)} onClick={(e) => { if (e.target === rdlg.current) closeRecipes(); }}>
        {recipes && <Recipes api={api} onClose={closeRecipes} />}
      </dialog>
    </div>
  );
}

