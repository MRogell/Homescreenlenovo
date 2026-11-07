"use client";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { useRefresh } from "./refresh-context";

type Action = "play" | "pause" | "next" | "previous";
type Device = { id: string; name: string; type: string };

/** Styrknappar för Spotify. Stora tryckytor (minst 48 px). Fel visas som text under knapparna. */
export function SpotifyControls({ playing }: { playing: boolean }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Flera Spotify-enheter men ingen aktiv: användaren väljer var musiken ska spelas.
  const [choices, setChoices] = useState<Device[] | null>(null);

  async function send(action: Action, deviceId?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control/spotify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deviceId ? { action, deviceId } : { action }) });
      if (!res.ok && res.status !== 204) {
        const j = (await res.json().catch(() => null)) as { error?: string; code?: string; devices?: Device[] } | null;
        if (j?.code === "choose_device" && j.devices?.length) {
          setChoices(j.devices);
        } else {
          setChoices(null);
          setError(j?.error ?? "Det gick inte att styra Spotify.");
        }
      } else {
        setChoices(null);
        // Spotify behöver en stund på sig innan den nya statusen syns.
        await new Promise((r) => setTimeout(r, 700));
        await refresh();
      }
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="controls">
      <div className="controls-row">
        <button type="button" className="ctl" aria-label="Föregående låt" disabled={busy} onClick={() => send("previous")}><SkipBack aria-hidden="true" /></button>
        <button type="button" className="ctl main" aria-label={playing ? "Pausa" : "Spela"} disabled={busy} onClick={() => send(playing ? "pause" : "play")}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="ctl" aria-label="Nästa låt" disabled={busy} onClick={() => send("next")}><SkipForward aria-hidden="true" /></button>
      </div>
      {choices && (
        <div className="devices" role="group" aria-label="Välj enhet">
          <p className="mid">Välj var musiken ska spelas:</p>
          {choices.map((d) => (
            <button key={d.id} type="button" className="device" disabled={busy} onClick={() => send("play", d.id)}>
              {d.name}
              <span>{d.type}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
