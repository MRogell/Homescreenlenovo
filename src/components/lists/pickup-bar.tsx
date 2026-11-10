"use client";
import { Check, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { addDays, nextDays, weekdayOf, weekdayShort, WEEKDAY_NAMES } from "@/lib/dinner";
import { localClock } from "@/server/calendar/time";
import type { ListsApi } from "./lists-panel";

const todayKey = () => localClock(new Date()).date;
const dayName = (date: string, today: string) => (date === today ? "idag" : date === addDays(today, 1) ? "imorgon" : `${WEEKDAY_NAMES[weekdayOf(date) - 1]} ${Number(date.slice(8))}`);

/** Namn att välja bland: de som hämtat nyligen, vanligaste först. */
function knownNames(api: ListsApi): string[] {
  const count = new Map<string, number>();
  for (const p of Object.values(api.state.pickups)) count.set(p.who, (count.get(p.who) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sv")).map(([n]) => n).slice(0, 8);
}

/** Redigerare för en dag: välj ett namn eller skriv ett nytt. */
function Sheet({ api, today, start, onClose, onHide }: { api: ListsApi; today: string; start: string; onClose: () => void; onHide?: () => void }) {
  const [date, setDate] = useState(start);
  const [text, setText] = useState("");
  const id = useId();
  const names = useMemo(() => knownNames(api), [api]);
  const days = nextDays(today);
  const cur = api.state.pickups[date];

  const save = (who: string) => { if (!who.trim()) return; api.setPickup(date, who); setText(""); onClose(); };
  return (
    <div className="sheet-in">
      <header className="sheet-head">
        <h2>Vem hämtar?</h2>
        <button type="button" className="icon-btn" aria-label="Stäng" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="pk-days" role="tablist" aria-label="Dag">
        {days.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={d === date} className={api.state.pickups[d] ? "has" : ""} onClick={() => setDate(d)}>
            <small>{d === today ? "Idag" : weekdayShort(weekdayOf(d))}</small><b>{Number(d.slice(8))}</b>
          </button>
        ))}
      </div>
      <p className="pk-cur" role="status">{cur ? <>Hämtar {dayName(date, today)}: <b>{cur.who}</b>{cur.by ? <small> · satt av {cur.by}</small> : null}</> : <>Ingen vald {dayName(date, today)}.</>}</p>
      {names.length > 0 && (
        <div className="li-chips" aria-label="Förslag på namn">
          {names.map((n) => <button key={n} type="button" className="li-chip" onClick={() => save(n)}>{cur?.who === n && <Check aria-hidden="true" />}{n}</button>)}
        </div>
      )}
      <form className="li-form" onSubmit={(e) => { e.preventDefault(); save(text); }}>
        <label className="sr-only" htmlFor={id}>Namn</label>
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Namn, till exempel Mamma" maxLength={30} autoComplete="off" enterKeyHint="done" />
        <button type="submit" className="sm-btn primary" disabled={!text.trim()}>Spara</button>
      </form>
      {cur && <button type="button" className="sm-btn danger-text pk-del" onClick={() => { api.setPickup(date, ""); onClose(); }}><Trash2 aria-hidden="true" />Ta bort för {dayName(date, today)}</button>}
      {onHide && <button type="button" className="pk-off" onClick={() => { onClose(); onHide(); }}>Dölj Vem hämtar? på hemskärmen</button>}
    </div>
  );
}

/** "Vem hämtar?": idag och imorgon som två knappar, delas av alla i familjen via inköpslistans data. */
export function PickupBar({ api, onHide }: { api: ListsApi; onHide?: () => void }) {
  const [today, setToday] = useState(todayKey);
  const [open, setOpen] = useState<string | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { const t = setInterval(() => setToday(todayKey()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const close = () => { dlg.current?.close(); setOpen(null); };
  const tomorrow = addDays(today, 1);
  const chip = (d: string, label: string) => {
    const p = api.state.pickups[d];
    return (
      <button type="button" className={`pk-chip${p ? " set" : ""}`} onClick={() => setOpen(d)} aria-label={`Vem hämtar ${label}? ${p ? p.who : "Ingen vald"}. Tryck för att ändra`}>
        <UserRound aria-hidden="true" /><span>{label}</span><b>{p ? p.who : "—"}</b>
      </button>
    );
  };
  return (
    <div className="pk" role="group" aria-label="Vem hämtar?">
      {chip(today, "Hämtar idag")}
      {chip(tomorrow, "Hämtar imorgon")}
      <dialog ref={dlg} className="sheet" aria-label="Vem hämtar?" onClose={() => setOpen(null)} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {open && <Sheet key={open} api={api} today={today} start={open} onClose={close} onHide={onHide} />}
      </dialog>
    </div>
  );
}
