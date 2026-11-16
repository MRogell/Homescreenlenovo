"use client";
import { useState } from "react";

/** Testar Google-anslutningen och visar orsaken om något är fel. */
export function GoogleTest() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/calendar/google-test", { method: "POST" });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
      setRes({ ok: !!j?.ok, text: j?.text ?? j?.error ?? "Inget svar." });
    } catch {
      setRes({ ok: false, text: "Ingen kontakt med servern." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button type="button" className="sm-btn" disabled={busy} onClick={() => void run()}>{busy ? "Testar…" : "Testa Google-anslutningen"}</button>
      {res && <p className={res.ok ? "mid" : "err"} role="status">{res.text}</p>}
    </div>
  );
}
