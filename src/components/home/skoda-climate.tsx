"use client";
import { useState, useSyncExternalStore } from "react";
import { useRefresh } from "./refresh-context";
import { Icon } from "./icons";
import { clampTemp, formatTempC, MAX_TEMP_C, MIN_TEMP_C } from "./skoda-view";

const STORE_KEY = "skoda-climate-temp";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}
const noSubscribe = () => () => {};
function storeTemp(t: number) {
  try {
    localStorage.setItem(STORE_KEY, String(t));
  } catch {
    // Privat läge eller blockerad lagring: förvalet glöms bara.
  }
}

/** Starta/stoppa bilens klimatisering med vald temperatur. Ingen bekräftelse: ofarligt och lätt att stoppa. */
export function SkodaClimate({ on, targetC, text, pending }: { on: boolean | null; targetC: number | null; text: string | null; pending: boolean }) {
  const refresh = useRefresh();
  // Vald temperatur: det du valt nu, annars senast valda i den här webbläsaren, annars bilens måltemperatur, annars 21.
  const stored = useSyncExternalStore(noSubscribe, readStored, () => null);
  const [chosen, setChosen] = useState<number | null>(null);
  const temp = chosen ?? (stored && Number(stored) ? clampTemp(Number(stored)) : clampTemp(targetC ?? 21));
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function step(delta: number) {
    const t = clampTemp(temp + delta);
    setChosen(t);
    storeTemp(t);
  }

  async function send(action: "start" | "stop") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const body = action === "start" ? { action: "climate_start", temperatureC: temp } : { action: "climate_stop" };
      const res = await fetch("/api/control/skoda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Bilen tog inte emot kommandot");
      } else {
        await refresh();
      }
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`skoda-climate${on && !pending ? " on" : ""}${pending ? " pending" : ""}`}>
      <div className="skoda-climate-head">
        <Icon name="temp" />
        <span>{text ?? "Klimat"}</span>
      </div>
      <div className="skoda-climate-controls">
        {!on && (
          <div className="skoda-temp" role="group" aria-label="Temperatur">
            <button type="button" aria-label="Sänk temperatur" disabled={temp <= MIN_TEMP_C || !!busy} onClick={() => step(-0.5)}>–</button>
            <output aria-live="polite">{formatTempC(temp)}</output>
            <button type="button" aria-label="Höj temperatur" disabled={temp >= MAX_TEMP_C || !!busy} onClick={() => step(0.5)}>+</button>
          </div>
        )}
        {on ? (
          <button className="btn secondary" type="button" disabled={!!busy} onClick={() => send("stop")}>{busy === "stop" ? "Stoppar…" : "Stoppa"}</button>
        ) : (
          <button className="btn" type="button" disabled={!!busy} onClick={() => send("start")}>{busy === "start" ? "Startar…" : "Starta"}</button>
        )}
      </div>
      {error && <p className="mid small skoda-climate-error" role="alert">{error}</p>}
    </div>
  );
}
