"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { FREQUENCIES, FREQUENCY_LABEL, MEMBER_COLORS, MEMBER_KIND_LABEL, SHARE_LEVELS, SHARE_LEVEL_LABEL, VISIBILITIES, VISIBILITY_HINT, VISIBILITY_LABEL, type FamilyMember, type Frequency, type ShareLevel, type Visibility } from "@/lib/activity";
import { localDate } from "@/server/calendar/time";
import { useRefresh } from "./refresh-context";

export interface WritableCalendar { id: string; name: string }

/** "Ny aktivitet" med samma fält och val som i Veckiva. Skapas i Google- eller iCloud-kalendern och syns sedan på telefonen. */
export function CalendarAdd({ calendars, now }: { calendars: WritableCalendar[]; now: Date }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const uid = useId();
  const today = localDate(now);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [away, setAway] = useState(false);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("");
  const [recurrence, setRecurrence] = useState<Frequency>("NONE");
  const [until, setUntil] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [responsible, setResponsible] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [bring, setBring] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("HOUSEHOLD");
  const [shareLevel, setShareLevel] = useState<ShareLevel>("EDIT");
  const [cal, setCal] = useState(calendars[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const close = () => { dlg.current?.close(); setOpen(false); };
  const show = () => {
    setTitle(""); setDate(today); setEndDate(""); setAllDay(false); setAway(false); setStart("16:00"); setEnd(""); setRecurrence("NONE"); setUntil("");
    setPeople([]); setResponsible(""); setLocation(""); setNotes(""); setBring(""); setVisibility("HOUSEHOLD"); setShareLevel("EDIT"); setError(""); setOpen(true);
    fetch("/api/family", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { members?: FamilyMember[] } | null) => { if (j?.members) setMembers(j.members); }).catch(() => {});
  };
  const toggle = (id: string) => {
    setPeople((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    if (id === responsible) setResponsible("");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), date, ...(endDate ? { endDate } : {}), allDay, away,
          ...(allDay ? {} : { start, ...(end ? { end } : {}) }),
          recurrence, ...(recurrence !== "NONE" && until ? { until } : {}),
          participants: people, ...(responsible ? { responsible } : {}),
          location, notes, bring, visibility, shareLevel, ...(cal ? { calendarId: cal } : {}),
        }),
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

  const f = (k: string) => `${uid}${k}`;
  return (
    <>
      <button type="button" className="cal-add" onClick={show} aria-label="Ny aktivitet i kalendern"><Plus aria-hidden="true" /><span>Ny aktivitet</span></button>
      <dialog ref={dlg} className="sheet sheet-wide" aria-label="Ny aktivitet" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {open && (
          <form className="sheet-in" onSubmit={save}>
            <header className="sheet-head">
              <h2>Ny aktivitet</h2>
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={close}><X aria-hidden="true" /></button>
            </header>

            <div className="ca-box">
              <label className="dn-label" htmlFor={f("t")}>Namn</label>
              <input id={f("t")} className="ca-field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoComplete="off" placeholder="t.ex. Fotbollsträning" autoFocus required />
              <div className="ca-row">
                <div><label className="dn-label" htmlFor={f("d")}>{recurrence !== "NONE" ? "Seriens startdatum" : "Datum"}</label><input id={f("d")} className="ca-field" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required /></div>
                {allDay && recurrence === "NONE" && <div><label className="dn-label" htmlFor={f("e")}>Till (valfritt)</label><input id={f("e")} className="ca-field" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} /></div>}
              </div>
              <label className="dn-check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /><span><b>Heldag</b></span></label>
              <label className="dn-check"><input type="checkbox" checked={away} onChange={(e) => setAway(e.target.checked)} /><span><b>Bortrest</b><small className="ca-hint">Deltagarna visas inte som hemma under Hemma den här veckan</small></span></label>
              {!allDay && (
                <div className="ca-row">
                  <div><label className="dn-label" htmlFor={f("s")}>Starttid</label><input id={f("s")} className="ca-field" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
                  <div><label className="dn-label" htmlFor={f("n")}>Sluttid <span className="ca-opt">(valfritt)</span></label><input id={f("n")} className="ca-field" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </div>
              )}
              <label className="dn-label" htmlFor={f("r")}>Upprepning</label>
              <select id={f("r")} className="ca-field" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Frequency)}>{FREQUENCIES.map((x) => <option key={x} value={x}>{FREQUENCY_LABEL[x]}</option>)}</select>
              {recurrence !== "NONE" && (
                <div>
                  <label className="dn-label" htmlFor={f("u")}>Upprepas till och med <span className="ca-opt">(valfritt)</span></label>
                  <input id={f("u")} className="ca-field" type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
                  <small className="ca-hint">Lämna tomt om den ska fortsätta tills vidare.</small>
                </div>
              )}
            </div>

            <div className="ca-box">
              <b className="dn-label">Vem deltar?</b>
              {members.length === 0 ? (
                <p className="mid small">Lägg till familjemedlemmar under Inställningar → Familjen, så kan du välja vilka som deltar.</p>
              ) : (
                <div className="ca-people">
                  {members.map((m, i) => (
                    <label key={m.id} className="dn-check ca-person">
                      <input type="checkbox" checked={people.includes(m.id)} onChange={() => toggle(m.id)} />
                      <span className="ca-avatar" style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }} aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span>
                      <span><b>{m.name}</b><small className="ca-hint">{MEMBER_KIND_LABEL[m.kind]}</small></span>
                    </label>
                  ))}
                </div>
              )}
              <label className="dn-label" htmlFor={f("a")}>Vem är ansvarig? <span className="ca-opt">(valfritt)</span></label>
              <small className="ca-hint">Den som ser till att det blir gjort, t.ex. skjutsar.</small>
              <select id={f("a")} className="ca-field" value={responsible} onChange={(e) => setResponsible(e.target.value)} disabled={people.length === 0}>
                <option value="">Ingen särskild</option>
                {members.filter((m) => people.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="ca-box">
              <label className="dn-label" htmlFor={f("p")}>Plats <span className="ca-opt">(valfritt)</span></label>
              <input id={f("p")} className="ca-field" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} autoComplete="off" />
              <label className="dn-label" htmlFor={f("b")}>Beskrivning <span className="ca-opt">(valfritt)</span></label>
              <textarea id={f("b")} className="ca-field ca-area" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
              <label className="dn-label" htmlFor={f("w")}>Att ta med <span className="ca-opt">(valfritt)</span></label>
              <small className="ca-hint">En punkt per rad.</small>
              <textarea id={f("w")} className="ca-field ca-area" rows={3} value={bring} onChange={(e) => setBring(e.target.value)} placeholder={"Gympapåse\nVattenflaska"} />
            </div>

            <div className="ca-box">
              {calendars.length > 1 && (
                <>
                  <label className="dn-label" htmlFor={f("c")}>Kalender</label>
                  <select id={f("c")} className="ca-field" value={cal} onChange={(e) => setCal(e.target.value)}>{calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </>
              )}
              <label className="dn-label" htmlFor={f("v")}>Vem ser aktiviteten?</label>
              <small className="ca-hint">{VISIBILITY_HINT[visibility]}</small>
              <select id={f("v")} className="ca-field" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>{VISIBILITIES.map((x) => <option key={x} value={x}>{VISIBILITY_LABEL[x]}</option>)}</select>
              <label className="dn-label" htmlFor={f("l")}>Delningsnivå</label>
              <small className="ca-hint">Vad andra som ser aktiviteten får göra. Du och deltagarna ser alltid alla detaljer.</small>
              <select id={f("l")} className="ca-field" value={shareLevel} onChange={(e) => setShareLevel(e.target.value as ShareLevel)}>{SHARE_LEVELS.map((x) => <option key={x} value={x}>{SHARE_LEVEL_LABEL[x]}</option>)}</select>
            </div>

            {error && <p className="err" role="alert">{error}</p>}
            <div className="dn-actions ca-actions">
              <button type="button" className="sm-btn" onClick={close}>Avbryt</button>
              <button type="submit" className="sm-btn primary" disabled={busy || !title.trim()}>{busy ? "Sparar…" : "Spara aktivitet"}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
