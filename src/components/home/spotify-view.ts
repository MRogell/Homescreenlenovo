/** "3:28", eller "1:02:05" för långa poddavsnitt. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Förloppet räknas fram mellan hämtningarna så att stapeln rör sig jämnt. Stannar vid låtens slut och när den är pausad. */
export function estimateProgress(p: { progressMs: number | null; durationMs: number | null; playing: boolean; elapsedMs: number }): number | null {
  if (p.progressMs === null || p.durationMs === null) return null;
  const ms = p.progressMs + (p.playing ? Math.max(0, p.elapsedMs) : 0);
  return Math.min(p.durationMs, ms);
}

/** Medelfärg av omslagets färgade pixlar (RGBA). Nästan svart, nästan vitt och genomskinligt räknas inte. */
export function tintFromPixels(px: Uint8ClampedArray): string | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const [pr, pg, pb, pa] = [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!];
    const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
    if (pa < 128 || max < 30 || min > 225) continue;
    r += pr; g += pg; b += pb; n++;
  }
  return n ? `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` : null;
}
