"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Formulär för uppgifterna från Electrolux utvecklarportal. De provas mot Electrolux innan de sparas. */
export function AegConnect({ reconnect }: { reconnect: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/aeg/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: f.get("apiKey"), accessToken: f.get("accessToken"), refreshToken: f.get("refreshToken") }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        return setError(j?.error ?? "Det gick inte att ansluta AEG.");
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span>{reconnect ? "Anslut igen" : "Ej ansluten"}</span>
        <button className="btn" type="button" onClick={() => setOpen(true)}>{reconnect ? "Anslut igen" : "Anslut"}</button>
      </span>
    );
  }
  return (
    <form className="aeg-form" onSubmit={onSubmit}>
      <p className="mid">
        Logga in på <a className="link" href="https://developer.electrolux.one" target="_blank" rel="noopener noreferrer">developer.electrolux.one</a> med ditt AEG-konto,
        skapa en API-nyckel och generera access- och refresh-token. Klistra in dem här.
      </p>
      <label htmlFor="aeg-api-key">API-nyckel<input id="aeg-api-key" name="apiKey" autoComplete="off" required /></label>
      <label htmlFor="aeg-access">Access-token<input id="aeg-access" name="accessToken" autoComplete="off" required /></label>
      <label htmlFor="aeg-refresh">Refresh-token<input id="aeg-refresh" name="refreshToken" autoComplete="off" required /></label>
      {error && <p className="err" role="alert">{error}</p>}
      <span style={{ display: "flex", gap: 12 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Kontrollerar…" : "Spara"}</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Avbryt</button>
      </span>
    </form>
  );
}
