/** 62 -> "1 h 2 min", 42 -> "42 min", 60 -> "1 h". */
export function formatMinutes(n: number): string {
  const m = Math.max(0, Math.round(n));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** "just nu", "4 min sedan", "2 h sedan", "3 dygn sedan". Framtida tidpunkter räknas som "just nu". */
export function formatAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "just nu";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min sedan`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h sedan`;
  return `${Math.floor(h / 24)} dygn sedan`;
}

/** 21.4 -> "21,4" (svensk decimal). */
export function formatTemp(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

/** 20 -> "20", 23.5 -> "23,5" (en decimal, utan ",0"). */
export function formatTempShort(n: number): string {
  // toFixed avrundar halvor bort från noll även för minusgrader (-3,25 -> -3,3).
  const r = Number(n.toFixed(1));
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", ",");
}
