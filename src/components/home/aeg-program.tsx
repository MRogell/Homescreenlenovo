"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { programLabel } from "@/lib/aeg";
import { useRefresh } from "./refresh-context";

/**
 * Programraden. När maskinen är redo och fjärrstyrning är på blir programmet en knapp som öppnar listan
 * med de program maskinen själv stöder. Listan öppnas ovanpå kortet, så att inget hoppar. Annars vanlig text.
 */
export function AegProgram({ label, currentUid, programs, canChange }: { label: string | null; currentUid: string | null; programs: string[]; canChange: boolean }) {
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  // Listan stängs vid klick utanför eller Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!label) return null;
  // Minst två val krävs för att det ska vara något att välja mellan.
  if (!canChange || programs.length < 2) return <strong>{label}</strong>;

  async function choose(uid: string) {
    if (busy || uid === currentUid) return setOpen(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control/aeg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "program", program: uid }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Det gick inte att byta program.");
      } else {
        setOpen(false);
        setTimeout(() => void refresh(), 1200);
      }
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="aeg-program" ref={wrap}>
      <button type="button" className="aeg-program-btn" aria-haspopup="true" aria-expanded={open} aria-label={`Program: ${label}. Byt program`} onClick={() => { setOpen((o) => !o); setError(null); }}>
        <strong>{label}</strong>
        <ChevronDown aria-hidden="true" className={open ? "open" : ""} />
      </button>
      {open && (
        <span className="aeg-program-list" role="group" aria-label="Välj program">
          {programs.map((uid) => (
            <button key={uid} type="button" className="aeg-program-item" disabled={busy} aria-current={uid === currentUid ? "true" : undefined} onClick={() => choose(uid)}>
              {programLabel(uid)}
              {uid === currentUid && <small>Valt</small>}
            </button>
          ))}
          {error && <span className="err" role="alert">{error}</span>}
        </span>
      )}
    </span>
  );
}
