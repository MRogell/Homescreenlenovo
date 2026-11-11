"use client";
import { Check, Plus, Timer as TimerIcon, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatCountdown, MAX_TIMER_MIN, MAX_TIMERS, timerLabel, type TimerItem } from "@/lib/smart";

const PRESETS = [5, 10, 15, 30];

async function put(body: object): Promise<{ timers?: TimerItem[]; error?: string }> {
  try {
    const res = await fetch("/api/timers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => null)) as { timers?: TimerItem[]; error?: string } | null;
    if (!res.ok || !j?.timers) return { error: j?.error ?? "Det gick inte att spara." };
    return { timers: j.timers };
  } catch {
    return { error: "Ingen kontakt med servern." };
  }
}

/** Tre korta pip. Ljudet kan blockeras av webbläsaren om ingen tryckt på sidan: då räcker notisen och den röda knappen. */
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t); o.stop(t + 0.3);
    }
  } catch {
    // Inget ljud: ingen fara.
  }
}

/** Äggklocka och timers: knapp bredvid hälsningen, nedräkning som knappar, och en panel för att starta nya. Delas mellan skärmarna. */
export function TimerChip({ timers, onChange }: { timers: TimerItem[]; onChange: (t: TimerItem[]) => void }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const ctx = useRef<AudioContext | null>(null);
  const rang = useRef<Set<string>>(new Set());
  const id = useId();
  const running = timers.filter((t) => t.endsAt > nowMs);

  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  // Klockan tas om direkt när listan ändras, annars visas en gammal tid i en halv sekund.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, [timers]);
  useEffect(() => {
    if (timers.length === 0) return;
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, [timers.length]);
  // Pip en gång per timer som går av medan skärmen är öppen.
  useEffect(() => {
    for (const t of timers) {
      if (t.endsAt <= nowMs && nowMs - t.endsAt < 60_000 && !rang.current.has(t.id)) { rang.current.add(t.id); beep(ctx.current); }
    }
  }, [timers, nowMs]);

  const close = () => { dlg.current?.close(); setOpen(false); setError(null); };
  async function act(body: object, closeAfter = false) {
    if (!ctx.current && typeof AudioContext !== "undefined") { try { ctx.current = new AudioContext(); } catch { /* inget ljud */ } }
    setBusy(true); setError(null);
    const r = await put(body);
    setBusy(false);
    if (r.timers) { onChange(r.timers); if (closeAfter) close(); } else setError(r.error ?? "Det gick inte att spara.");
  }
  const start = (minutes: number) => { if (minutes >= 1 && minutes <= MAX_TIMER_MIN) void act({ start: { minutes, ...(label.trim() ? { label: label.trim() } : {}) } }, true); };
  const customMin = Number(custom.replace(",", "."));
  const customOk = custom.trim() !== "" && Number.isFinite(customMin) && customMin >= 1 && customMin <= MAX_TIMER_MIN;

  return (
    <div className="tm" role="group" aria-label="Timer">
      {timers.map((t) => {
        const left = t.endsAt - nowMs;
        const done = left <= 0;
        return (
          <button key={t.id} type="button" className={`tm-chip${done ? " done" : ""}`} onClick={() => (done ? void act({ cancel: t.id }) : setOpen(true))} aria-label={done ? `${timerLabel(t)} är klar. Tryck för att stänga av` : `${timerLabel(t)}: ${formatCountdown(left)} kvar`}>
            <TimerIcon aria-hidden="true" />{done ? <><b>{timerLabel(t)}</b><span>Klart!</span></> : <><span>{timerLabel(t)}</span><b>{formatCountdown(left)}</b></>}
          </button>
        );
      })}
      {running.length === 0 && timers.every((t) => t.endsAt > nowMs) && (
        <button type="button" className="tm-chip" onClick={() => setOpen(true)} aria-label="Starta timer"><TimerIcon aria-hidden="true" /><span>Timer</span></button>
      )}
      <dialog ref={dlg} className="sheet" aria-label="Timer" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {open && (
          <div className="sheet-in">
            <header className="sheet-head">
              <h2>Timer</h2>
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={close}><X aria-hidden="true" /></button>
            </header>
            {running.length > 0 && (
              <ul className="tm-list" aria-label="Pågående timers">
                {running.map((t) => (
                  <li key={t.id}><span><b>{formatCountdown(t.endsAt - nowMs)}</b><small>{timerLabel(t)}</small></span><button type="button" className="sm-btn" disabled={busy} onClick={() => void act({ cancel: t.id })}>Avbryt</button></li>
                ))}
              </ul>
            )}
            {running.length < MAX_TIMERS ? (
              <>
                <div className="tm-presets" aria-label="Snabbval">
                  {PRESETS.map((m) => <button key={m} type="button" disabled={busy} onClick={() => start(m)}><b>{m}</b><small>min</small></button>)}
                </div>
                <form className="li-form" onSubmit={(e) => { e.preventDefault(); if (customOk) start(customMin); }}>
                  <label className="sr-only" htmlFor={id}>Egna minuter</label>
                  <input id={id} value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Egna minuter, till exempel 12" autoComplete="off" maxLength={5} />
                  <button type="submit" className="sm-btn primary" disabled={busy || !customOk}><Plus aria-hidden="true" />Starta</button>
                </form>
                <label className="sr-only" htmlFor={`${id}-l`}>Namn på timern</label>
                <input id={`${id}-l`} className="dn-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Namn (valfritt), till exempel Ägg" maxLength={30} autoComplete="off" />
              </>
            ) : <p className="mid small"><Check aria-hidden="true" /> Högst {MAX_TIMERS} timers åt gången.</p>}
            {error && <p className="err" role="alert">{error}</p>}
          </div>
        )}
      </dialog>
    </div>
  );
}
