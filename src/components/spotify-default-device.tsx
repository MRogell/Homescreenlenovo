"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Device = { id: string; name: string; type: string; active?: boolean };

/** Val av standardenhet för Spotify (används när man trycker spela och ingen enhet är igång). */
export function SpotifyDefaultDevice({ current }: { current: { id: string; name: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control/spotify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "devices" }) });
      const j = (await res.json().catch(() => null)) as { devices?: Device[]; error?: string } | null;
      if (!res.ok) return setError(j?.error ?? "Det gick inte att hämta enheter.");
      if (!j?.devices?.length) return setError("Spotify ser inga enheter just nu. Öppna Spotify på enheten och försök igen.");
      setDevices(j.devices);
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spotify/default-device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        return setError(j?.error ?? "Det gick inte att spara.");
      }
      setDevices(null);
      router.refresh();
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="devices">
      <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <span>Standardenhet för Spotify</span>
        <span style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>{current ? current.name : "Ingen vald"}</span>
          <button className="btn" type="button" disabled={busy} onClick={devices ? () => setDevices(null) : load}>{devices ? "Stäng" : current ? "Ändra" : "Välj"}</button>
          {current && !devices && <button className="btn secondary" type="button" disabled={busy} onClick={() => save({ clear: true })}>Ta bort</button>}
        </span>
      </div>
      {devices && (
        <div className="devices" role="group" aria-label="Välj standardenhet">
          {devices.map((d) => (
            <button key={d.id} type="button" className="device" disabled={busy} aria-current={current?.id === d.id ? "true" : undefined} onClick={() => save({ deviceId: d.id, name: d.name })}>
              {d.name}
              <span>{current?.id === d.id ? "Standard" : d.type}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mid">Används när du trycker spela och ingen enhet är igång. Enheten måste synas för Spotify, t.ex. att Spotify-appen nyligen varit öppen.</p>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
