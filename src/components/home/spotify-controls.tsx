"use client";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { useRefresh } from "./refresh-context";

type Action = "play" | "pause" | "next" | "previous";

/** Styrknappar för Spotify. Stora tryckytor (minst 48 px). Fel visas som text under knapparna. */
export function SpotifyControls({ playing }: { playing: boolean }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: Action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control/spotify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok && res.status !== 204) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Det gick inte att styra Spotify.");
      } else {
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
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
