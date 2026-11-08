"use client";
import { useEffect, useState } from "react";
import { estimateProgress, formatDuration } from "./spotify-view";

/** Förloppsstapel som rör sig mellan hämtningarna. Tiden räknas från när Spotify svarade (fetchedAt), så även ett cachat svar visar rätt läge. */
export function SpotifyProgress({ progressMs, durationMs, playing, fetchedAt }: { progressMs: number | null; durationMs: number | null; playing: boolean; fetchedAt: string | null }) {
  const start = fetchedAt ? Date.parse(fetchedAt) : NaN;
  // Startvärdet är svarstiden (samma på server och klient, ingen hydreringsskillnad); klockan tar över efter första sekunden.
  const [now, setNow] = useState(() => (Number.isFinite(start) ? start : 0));
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [playing]);
  const ms = estimateProgress({ progressMs, durationMs, playing, elapsedMs: Number.isFinite(start) ? now - start : 0 });
  if (ms === null || !durationMs) return null;
  const pct = Math.min(100, (ms / durationMs) * 100);
  return (
    <div className="sp-progress">
      <div className="sp-progress-bar" role="progressbar" aria-label="Förlopp" aria-valuemin={0} aria-valuemax={Math.round(durationMs / 1000)} aria-valuenow={Math.round(ms / 1000)} aria-valuetext={`${formatDuration(ms)} av ${formatDuration(durationMs)}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="sp-progress-times"><span>{formatDuration(ms)}</span><span>{formatDuration(durationMs)}</span></div>
    </div>
  );
}
