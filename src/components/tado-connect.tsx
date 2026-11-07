"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Pending = { userCode: string; verifyUrl: string; expiresAt: number; intervalS: number };

const MESSAGES: Record<string, string> = {
  expired: "Koden gick ut innan den godkändes. Försök igen.",
  denied: "Inloggningen nekades hos Tado.",
  failed: "Det gick inte att ansluta Tado. Försök igen om en stund.",
};

/** Ansluter Tado med Tados enhetskod: öppna länken, godkänn, så blir anslutningen klar av sig själv. */
export function TadoConnect({ label = "Anslut" }: { label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function poll(p: Pending) {
    try {
      const res = await fetch("/api/tado/poll", { method: "POST" });
      const j = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;
      if (j?.status === "ok") {
        setPending(null);
        router.refresh();
        return;
      }
      if (j?.status === "pending") {
        timer.current = setTimeout(() => void poll(p), p.intervalS * 1000);
        return;
      }
      setPending(null);
      setError(MESSAGES[j?.status ?? ""] ?? j?.error ?? MESSAGES.failed!);
    } catch {
      // Tillfälligt nätfel: försök igen.
      timer.current = setTimeout(() => void poll(p), p.intervalS * 1000);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tado/start", { method: "POST" });
      const j = (await res.json().catch(() => null)) as (Pending & { error?: string }) | null;
      if (!res.ok || !j?.verifyUrl) return setError(j?.error ?? MESSAGES.failed!);
      setPending(j);
      timer.current = setTimeout(() => void poll(j), j.intervalS * 1000);
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <span className="tado-pending">
        <a className="btn" href={pending.verifyUrl} target="_blank" rel="noopener noreferrer">Godkänn hos Tado</a>
        <span className="mid">Kod: <strong>{pending.userCode}</strong> · väntar på godkännande…</span>
      </span>
    );
  }
  return (
    <span className="tado-pending">
      <button className="btn" type="button" disabled={busy} onClick={start}>{label}</button>
      {error && <span className="err" role="alert">{error}</span>}
    </span>
  );
}
