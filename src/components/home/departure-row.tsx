"use client";
import { Clock, Minus, Plus, SkipForward, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { cleanTimes, LEAD_OPTIONS, MAX_TIMES_PER_DAY, type DepartureView } from "@/lib/departure";

type Settings = DepartureView["settings"];
const DAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const DEFAULT_TIME = "07:30";
const DEFAULT_SECOND = "17:00";

async function put(body: object): Promise<{ view?: DepartureView; error?: string }> {
  try {
    const res = await fetch("/api/departure", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => null)) as { departure?: DepartureView; error?: string } | null;
    if (!res.ok || !j?.departure) return { error: j?.error ?? "Det gick inte att spara." };
    return { view: j.departure };
  } catch {
    return { error: "Ingen kontakt med servern." };
  }
}
const toPatch = (s: Settings) => ({ enabled: s.enabled, times: Object.fromEntries(Object.entries(s.times).map(([k, v]) => [k, cleanTimes(v)])), leadMin: s.leadMin, belowC: s.belowC, targetC: s.targetC });

/** Raden under klimatrutan: avresetid och läge. Tryck på texten för inställningarna, på strömbrytaren för på/av. */
export function DepartureRow({ view, onChange }: { view: DepartureView; onChange: (v: DepartureView) => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Settings>(view.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = view.settings;

  async function save(next: Settings, close = false) {
    setBusy(true);
    setError(null);
    const r = await put({ settings: toPatch(next) });
    setBusy(false);
    if (r.view) { onChange(r.view); if (close) dlg.current?.close(); } else setError(r.error ?? "Det gick inte att spara.");
  }
  async function skip(value: boolean) {
    setBusy(true);
    setError(null);
    const r = await put({ skip: value });
    setBusy(false);
    if (r.view) { onChange(r.view); dlg.current?.close(); } else setError(r.error ?? "Det gick inte att spara.");
  }
  const open = () => { setForm(s); setError(null); dlg.current?.showModal(); };
  const setDay = (d: number, on: boolean) => setForm((f) => {
    const times = { ...f.times };
    if (!on) { if (Object.keys(times).length > 1) delete times[String(d)]; }
    else times[String(d)] = [Object.values(times)[0]?.[0] ?? DEFAULT_TIME];
    return { ...f, times };
  });
  const setTime = (d: number, i: number, t: string) => { if (/^\d{2}:\d{2}$/.test(t)) setForm((f) => ({ ...f, times: { ...f.times, [String(d)]: (f.times[String(d)] ?? []).map((x, j) => (j === i ? t : x)) } })); };
  const addTime = (d: number) => setForm((f) => { const cur = f.times[String(d)] ?? []; return cur.length >= MAX_TIMES_PER_DAY ? f : { ...f, times: { ...f.times, [String(d)]: [...cur, cur[0] && cur[0] >= "12:00" ? DEFAULT_TIME : DEFAULT_SECOND] } }; });
  const removeTime = (d: number, i: number) => setForm((f) => { const cur = f.times[String(d)] ?? []; return cur.length <= 1 ? f : { ...f, times: { ...f.times, [String(d)]: cur.filter((_, j) => j !== i) } }; });
  const sameForAll = () => setForm((f) => { const first = Object.values(f.times)[0] ?? [DEFAULT_TIME]; return { ...f, times: Object.fromEntries(Object.keys(f.times).map((k) => [k, [...first]])) }; });
  const mixed = new Set(Object.values(form.times).map((v) => v.join())).size > 1;
  const target = (delta: number) => setForm((f) => ({ ...f, targetC: Math.min(29.5, Math.max(16, Math.round((f.targetC + delta) * 2) / 2)) }));

  return (
    <>
      <div className={`dep dep-${view.tone}`}>
        <button type="button" className="dep-main" onClick={open} aria-label="Inställningar för förvärm till avresa">
          <Clock aria-hidden="true" />
          <span className="dep-text"><b>{view.line}</b>{view.sub && <small>{view.sub}</small>}</span>
        </button>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="Förvärm till avresa" className="dep-switch" disabled={busy} onClick={() => void save({ ...s, enabled: !s.enabled })}><span aria-hidden="true" /></button>
      </div>

      <dialog ref={dlg} className="sheet" aria-labelledby="dep-title" onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <div className="sheet-in">
          <header className="sheet-head">
            <h2 id="dep-title">Förvärm till avresa</h2>
            <button type="button" className="icon-btn" aria-label="Stäng" onClick={() => dlg.current?.close()}><X aria-hidden="true" /></button>
          </header>
          <label className="dep-field row-switch">
            <span>På</span>
            <button type="button" role="switch" aria-checked={form.enabled} className="dep-switch" onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}><span aria-hidden="true" /></button>
          </label>
          <fieldset className="dep-week">
            <legend>Avresa per dag</legend>
            {DAY_NAMES.map((n, i) => {
              const d = i + 1, t = form.times[String(d)];
              return (
                <div key={n} className={`dep-day${t ? " on" : ""}`}>
                  <button type="button" role="switch" aria-checked={!!t} aria-label={`${n}: förvärm`} className="dep-switch small" onClick={() => setDay(d, !t)}><span aria-hidden="true" /></button>
                  <span className="dep-dayname">{n}</span>
                  <div className="dep-times">
                    {(t ?? [DEFAULT_TIME]).map((x, j) => (
                      <div key={j} className="dep-time">
                        <input type="time" value={x} disabled={!t} aria-label={`Avresetid ${n.toLowerCase()}${(t?.length ?? 1) > 1 ? ` ${j === 0 ? "första" : "andra"}` : ""}`} onChange={(e) => setTime(d, j, e.target.value)} />
                        {t && t.length > 1 && <button type="button" className="dep-x" aria-label={`Ta bort ${j === 0 ? "första" : "andra"} tiden ${n.toLowerCase()}`} onClick={() => removeTime(d, j)}><X aria-hidden="true" /></button>}
                      </div>
                    ))}
                    {t && t.length < MAX_TIMES_PER_DAY && <button type="button" className="dep-add" onClick={() => addTime(d)}><Plus aria-hidden="true" />Lägg till tid</button>}
                  </div>
                </div>
              );
            })}
            {mixed && <button type="button" className="sm-btn" onClick={sameForAll}>Samma tid alla valda dagar</button>}
          </fieldset>
          <fieldset className="dep-days">
            <legend>Starta före avresa</legend>
            {LEAD_OPTIONS.map((m) => <button key={m} type="button" aria-pressed={form.leadMin === m} onClick={() => setForm((f) => ({ ...f, leadMin: m }))}>{m} min</button>)}
          </fieldset>
          <label className="dep-field col">
            <span>Bara om det är {form.belowC}° eller kallare ute</span>
            <input type="range" min={-10} max={15} step={1} value={form.belowC} onChange={(e) => setForm((f) => ({ ...f, belowC: Number(e.target.value) }))} aria-valuetext={`${form.belowC} grader`} />
          </label>
          <div className="dep-field">
            <span>Måltemperatur</span>
            <span className="dep-step">
              <button type="button" aria-label="Sänk" onClick={() => target(-0.5)} disabled={form.targetC <= 16}><Minus aria-hidden="true" /></button>
              <output>{String(form.targetC).replace(".", ",")} °C</output>
              <button type="button" aria-label="Höj" onClick={() => target(0.5)} disabled={form.targetC >= 29.5}><Plus aria-hidden="true" /></button>
            </span>
          </div>
          <p className="mid small">Plattan (eller någon öppen skärm) måste vara på och ha nät vid starttiden. Är utetemperaturen okänd startar klimatet ändå.</p>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="dep-actions">
            <button type="button" className="sm-btn primary" disabled={busy} onClick={() => void save(form, true)}>Spara</button>
            {s.enabled && (s.skippedToday
              ? <button type="button" className="sm-btn" disabled={busy} onClick={() => void skip(false)}><Undo2 aria-hidden="true" />Ångra överhopp</button>
              : <button type="button" className="sm-btn" disabled={busy} onClick={() => void skip(true)}><SkipForward aria-hidden="true" />Hoppa över idag</button>)}
          </div>
        </div>
      </dialog>
    </>
  );
}
