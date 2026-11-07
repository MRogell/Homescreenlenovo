"use client";
import { useState } from "react";
import { useRefresh } from "./refresh-context";

type Action = "start" | "pause" | "resume" | "stop";
const LABEL: Record<Action, string> = { start: "Starta", pause: "Pausa", resume: "Återuppta", stop: "Stoppa" };
const CONFIRM: Partial<Record<Action, string>> = { start: "Starta diskmaskinen nu?", stop: "Stoppa diskmaskinen? Programmet avbryts." };

/** Fjärrstyrning av diskmaskinen. Start och stopp kräver ett extra tryck, så att ett feltryck inte gör något. */
export function AegControls({ state, remoteControl }: { state: string; remoteControl: string | null }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);

  // AEG kräver att fjärrstart slås på på själva maskinen. Okänt läge (null): knapparna visas, och AEG svarar om det inte går.
  const canStart = remoteControl === null || remoteControl === "ENABLED";
  const canControl = canStart || remoteControl === "NOT_SAFETY_RELEVANT_ENABLED";
  const actions: Action[] =
    state === "READY_TO_START" || state === "IDLE" ? (canStart ? ["start"] : [])
    : state === "RUNNING" ? (canControl ? ["pause", "stop"] : [])
    : state === "PAUSED" ? (canControl ? ["resume", "stop"] : [])
    : state === "DELAYED_START" ? (canControl ? ["stop"] : [])
    : [];

  async function send(action: Action) {
    if (busy) return;
    if (CONFIRM[action] && confirming !== action) return setConfirming(action);
    setConfirming(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control/aeg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Det gick inte att styra diskmaskinen.");
      } else {
        setTimeout(() => void refresh(), 1500);
      }
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  const hint = (state === "READY_TO_START" || state === "IDLE") && !canStart
    ? "Tryck på fjärrstart på diskmaskinen för att kunna starta härifrån."
    : null;

  if (actions.length === 0 && !hint && !error) return null;
  return (
    <div className="aeg-controls">
      {confirming ? (
        <div className="aeg-confirm" role="group" aria-label="Bekräfta">
          <span>{CONFIRM[confirming]}</span>
          <span className="aeg-buttons">
            <button className="btn" type="button" disabled={busy} onClick={() => send(confirming)}>Ja, {LABEL[confirming].toLowerCase()}</button>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => setConfirming(null)}>Avbryt</button>
          </span>
        </div>
      ) : (
        actions.length > 0 && (
          <span className="aeg-buttons">
            {actions.map((a) => (
              <button key={a} className={a === "stop" ? "btn secondary" : "btn"} type="button" disabled={busy} onClick={() => send(a)}>{LABEL[a]}</button>
            ))}
          </span>
        )
      )}
      {hint && <p className="mid">{hint}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
