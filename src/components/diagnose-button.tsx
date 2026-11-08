"use client";
import { useState } from "react";

type Step = { name: string; ok: boolean; detail: string };

/** Testar anslutningen steg för steg och visar vad som fungerar. Läser bara, ändrar ingenting. */
export function DiagnoseButton({ provider, label }: { provider: "spotify" | "sonos"; label: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: Step[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/diagnose/${provider}`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; steps?: Step[]; error?: string } | null;
      if (!res.ok || !j?.steps) return setError(j?.error ?? "Testet kunde inte köras.");
      setResult({ ok: !!j.ok, steps: j.steps });
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diag">
      <button className="btn secondary" type="button" disabled={busy} onClick={run}>{busy ? "Testar…" : `Testa ${label}`}</button>
      {error && <p className="err" role="alert">{error}</p>}
      {result && (
        <ul className="diag-steps" aria-label={`Resultat för ${label}`}>
          {result.steps.map((s) => (
            <li key={s.name} className={s.ok ? "diag-ok" : "diag-fail"}>
              <strong>{s.ok ? "OK" : "Fel"} · {s.name}</strong>
              <span className="mid">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
