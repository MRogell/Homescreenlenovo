"use client";
import { useState, useSyncExternalStore } from "react";
import { useRefresh } from "./refresh-context";
import { Icon } from "./icons";
import { clampTemp, dialAngle, formatTempC, MAX_TEMP_C, MIN_TEMP_C } from "./skoda-view";
import type { DepartureView } from "@/lib/departure";
import { DepartureRow } from "./departure-row";

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
export function SkodaClimate({ on, targetC, text, pending, departure, onDeparture }: { on: boolean | null; targetC: number | null; text: string | null; pending: boolean; departure?: DepartureView | null; onDeparture?: (v: DepartureView) => void }) {
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

  // Medan klimatiseringen är på visas bilens måltemperatur; annars den du väljer.
  const shown = on && targetC !== null ? clampTemp(targetC) : temp;
  const a = (dialAngle(shown) * Math.PI) / 180;
  const marker = { x1: 100 + 74 * Math.sin(a), y1: 100 - 74 * Math.cos(a), x2: 100 + 94 * Math.sin(a), y2: 100 - 94 * Math.cos(a) };
  // Texten kommer från skodaView ("Klimat på · 22 °C · varm ca 07:45", "Skickat · väntar på bilen", "Klimat · läge okänt"); av = "Klimat · av".
  const status = text ?? "Klimat · av";

  return (
    <div className={`skoda-climate${on && !pending ? " on" : ""}${pending ? " pending" : ""}`}>
      <div className="skoda-climate-status"><Icon name="temp" /><span>{status}</span></div>
      <div className="skoda-dial">
        <svg viewBox="0 0 200 172" aria-hidden="true">
          <defs>
            <linearGradient id="skoda-dial-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--dial-cold)" />
              <stop offset=".5" stopColor="var(--dial-mid)" />
              <stop offset="1" stopColor="var(--dial-warm)" />
            </linearGradient>
          </defs>
          <path className="track" d="M 40.6 159.4 A 84 84 0 1 1 159.4 159.4" />
          <line className="marker" {...marker} />
        </svg>
        <div className="skoda-dial-center">
          <span className="label">{on ? "Mål" : "Temperatur"}</span>
          <div className="skoda-dial-value">
            {!on && <button type="button" className="minus" aria-label="Sänk temperatur" disabled={temp <= MIN_TEMP_C || !!busy} onClick={() => step(-0.5)}>–</button>}
            <output aria-live="polite" aria-label={`${formatTempC(shown)}`}>{String(shown).replace(".", ",")}°</output>
            {!on && <button type="button" className="plus" aria-label="Höj temperatur" disabled={temp >= MAX_TEMP_C || !!busy} onClick={() => step(0.5)}>+</button>}
          </div>
        </div>
      </div>
      {on ? (
        <button className="skoda-climate-btn stop" type="button" disabled={!!busy} onClick={() => send("stop")}>{busy === "stop" ? "Stoppar…" : "Stoppa"}</button>
      ) : (
        <button className="skoda-climate-btn start" type="button" disabled={!!busy} onClick={() => send("start")}>{busy === "start" ? "Startar…" : "Starta"}</button>
      )}
      {error && <p className="mid small skoda-climate-error" role="alert">{error}</p>}
      {departure && onDeparture && <DepartureRow view={departure} onChange={onDeparture} />}
    </div>
  );
}
