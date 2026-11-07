"use client";
import { Pause, Play, SkipBack, SkipForward, Speaker } from "lucide-react";
import { useState } from "react";
import { useRefresh } from "./refresh-context";

type Action = "play" | "pause" | "next" | "previous";
type Device = { id: string; name: string; type: string; active?: boolean };
type ApiBody = { error?: string; code?: string; devices?: Device[] };
// "choose": ingen enhet aktiv när man tryckte spela. "switch": användaren vill byta enhet.
type Picker = { mode: "choose" | "switch"; devices: Device[] };

/** Styrknappar och enhetsbyte för Spotify. Stora tryckytor (minst 48 px). Fel visas som text under knapparna. */
export function SpotifyControls({ playing, device }: { playing: boolean; device: string | null }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: ApiBody | null }> {
    const res = await fetch("/api/control/spotify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as ApiBody | null);
    return { ok: res.ok, data };
  }

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    setPicker(null);
    // Spotify behöver en stund på sig innan den nya statusen syns.
    await new Promise((r) => setTimeout(r, 700));
    await refresh();
  }

  const send = (action: Action) =>
    run(async () => {
      const { ok, data } = await post({ action });
      if (ok) return done();
      if (data?.code === "choose_device" && data.devices?.length) return setPicker({ mode: "choose", devices: data.devices });
      setPicker(null);
      setError(data?.error ?? "Det gick inte att styra Spotify.");
    });

  const openSwitcher = () =>
    run(async () => {
      if (picker?.mode === "switch") return setPicker(null);
      const { ok, data } = await post({ action: "devices" });
      if (!ok) return setError(data?.error ?? "Det gick inte att hämta enheter.");
      if (!data?.devices?.length) return setError("Spotify hittar inga enheter just nu. Öppna Spotify på den enhet du vill använda.");
      setPicker({ mode: "switch", devices: data.devices });
    });

  const moveTo = (d: Device) =>
    run(async () => {
      // Vid byte behålls läget (spelar/pausad). Vid "ingen aktiv enhet" ville användaren spela.
      const { ok, data } = await post({ action: "transfer", deviceId: d.id, play: picker?.mode === "choose" ? true : playing });
      if (ok) return done();
      setError(data?.error ?? "Det gick inte att byta enhet.");
    });

  return (
    <div className="controls">
      <div className="controls-row">
        <button type="button" className="ctl" aria-label="Föregående låt" disabled={busy} onClick={() => send("previous")}><SkipBack aria-hidden="true" /></button>
        <button type="button" className="ctl main" aria-label={playing ? "Pausa" : "Spela"} disabled={busy} onClick={() => send(playing ? "pause" : "play")}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="ctl" aria-label="Nästa låt" disabled={busy} onClick={() => send("next")}><SkipForward aria-hidden="true" /></button>
      </div>
      <button type="button" className="device switch" aria-expanded={picker?.mode === "switch"} disabled={busy} onClick={openSwitcher}>
        <span className="switch-label"><Speaker aria-hidden="true" /> Byt enhet</span>
        <span>{device ?? "Ingen aktiv"}</span>
      </button>
      {picker && (
        <div className="devices" role="group" aria-label="Välj enhet">
          <p className="mid">{picker.mode === "choose" ? "Välj var musiken ska spelas:" : "Spela på:"}</p>
          {picker.devices.map((d) => (
            <button key={d.id} type="button" className="device" disabled={busy || d.active} aria-current={d.active ? "true" : undefined} onClick={() => moveTo(d)}>
              {d.name}
              <span>{d.active ? "Spelar här" : d.type}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
