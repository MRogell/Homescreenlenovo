"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { localDate } from "@/server/calendar/time";
import { useRefresh } from "./refresh-context";

export interface WritableCalendar { id: string; name: string }

/** "Ny aktivitet": lägger en händelse i en Google-kalender (syns sedan i Google och telefonens kalender). */
export function CalendarAdd({ calendars, now }: { calendars: WritableCalendar[]; now: Date }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const uid = useId();
  const today = localDate(now);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("17:00");
  const [cal, setCal] = useState(calendars[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const close = () => { dlg.current?.close(); setOpen(false); };
  const show = () => { setTitle(""); setDate(today); setEndDate(""); setAllDay(false); setError(""); setOpen(true); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), date, ...(endDate ? { endDate } : {}), allDay, ...(allDay ? {} : { start, end }), ...(cal ? { calendarId: cal } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Det gick inte att spara.");
      close();
      void refresh();
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="cal-add" onClick={show} aria-label="Ny aktivitet i kalendern"><Plus aria-hidden="true" /><span>Ny aktivitet</span></button>
      <dialog ref={dlg} className="sheet" aria-label="Ny aktivitet" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {open && (
          <form className="sheet-in" onSubmit={save}>
            <header className="sheet-head">
              <h2>Ny aktivitet</h2>
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={close}><X aria-hidden="true" /></button>
            </header>
            <label className="dn-label" htmlFor={`${uid}t`}>Vad?</label>
            <input id={`${uid}t`} className="ca-field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoComplete="off" placeholder="Till exempel Fotbollsträning" autoFocus />
            <div className="ca-row">
              <div><label className="dn-label" htmlFor={`${uid}d`}>Datum</label><input id={`${uid}d`} className="ca-field" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required /></div>
              {allDay && <div><label className="dn-label" htmlFor={`${uid}e`}>Till (valfritt)</label><input id={`${uid}e`} className="ca-field" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} /></div>}
            </div>
            <label className="dn-check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /><span>Hela dagen</span></label>
            {!allDay && (
              <div className="ca-row">
                <div><label className="dn-label" htmlFor={`${uid}s`}>Start</label><input id={`${uid}s`} className="ca-field" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
                <div><label className="dn-label" htmlFor={`${uid}n`}>Slut</label><input id={`${uid}n`} className="ca-field" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
              </div>
            )}
            {calendars.length > 1 && (
              <>
                <label className="dn-label" htmlFor={`${uid}c`}>Kalender</label>
                <select id={`${uid}c`} className="ca-field" value={cal} onChange={(e) => setCal(e.target.value)}>{calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </>
            )}
            {error && <p className="err" role="alert">{error}</p>}
            <div className="dn-actions">
              <button type="submit" className="sm-btn primary" disabled={busy || !title.trim()}>{busy ? "Sparar…" : "Spara"}</button>
              <button type="button" className="sm-btn" onClick={close}>Avbryt</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
