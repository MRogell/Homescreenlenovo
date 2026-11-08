"use client";
import { Pause, Play, SkipBack, SkipForward, Speaker } from "lucide-react";
import { useEffect, useState } from "react";
import { useRefresh } from "./refresh-context";

type Action = "play" | "pause" | "next" | "previous";
type Device = { id: string; name: string; type: string; active?: boolean; restricted?: boolean };
type ApiBody = { error?: string; code?: string; devices?: Device[] };
// "choose": ingen enhet aktiv när man tryckte spela. "switch": användaren vill byta enhet.
type Picker = { mode: "choose" | "switch"; devices: Device[] };

/** Styrknappar och enhetsbyte för Spotify. Stora tryckytor (minst 48 px). Fel visas som text under knapparna. */
export function SpotifyControls({ playing, device }: { playing: boolean; device: string | null }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  // Visas direkt efter tryck (spela/pausa) tills ny status kommit från servern.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const shownPlaying = optimistic ?? playing;

  // Ny status från servern: släpp den tillfälliga visningen. En öppen bytlista med gammalt läge stängs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptimistic(null);
  }, [playing]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicker((p) => (p?.mode === "switch" ? null : p));
  }, [device]);

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

  function done() {
    setPicker(null);
    // Knapparna släpps direkt; kortet hämtar ny status i bakgrunden när Spotify hunnit uppdatera sig.
    setTimeout(() => void refresh(), 700);
  }

  const send = (action: Action) =>
    run(async () => {
      if (action === "play" || action === "pause") setOptimistic(action === "play");
      const { ok, data } = await post({ action });
      if (ok) return done();
      setOptimistic(null);
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
      const { ok, data } = await post({ action: "transfer", deviceId: d.id, play: picker?.mode === "choose" ? true : shownPlaying });
      if (ok) return done();
      setError(data?.error ?? "Det gick inte att byta enhet.");
    });

  return (
    <div className="controls">
      <div className="controls-row">
        <button type="button" className="ctl" aria-label="Föregående låt" disabled={busy} onClick={() => send("previous")}><SkipBack aria-hidden="true" /></button>
        <button type="button" className="ctl main" aria-label={shownPlaying ? "Pausa" : "Spela"} disabled={busy} onClick={() => send(shownPlaying ? "pause" : "play")}>
          {shownPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
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
            <button key={`${d.id}${d.name}`} type="button" className="device" disabled={busy || d.active || d.restricted} aria-current={d.active ? "true" : undefined} onClick={() => moveTo(d)}>
              {d.name}
              <span>{d.active ? "Spelar här" : d.restricted ? "Kan inte styras härifrån" : d.type}</span>
            </button>
          ))}
          {picker.mode === "switch" && <p className="mid small">Spotify visar här bara enheter som Spotify själv känner till just nu. Spotify-appen hittar fler på wifi, men det kan inte den här appen.</p>}
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
