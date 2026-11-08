"use client";
import { Pause, Play, SkipBack, SkipForward, Speaker } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRefreshSpotify } from "./refresh-context";

type Action = "play" | "pause" | "next" | "previous";
type Device = { id: string; name: string; type: string; active?: boolean; restricted?: boolean };
type ApiBody = { error?: string; code?: string; devices?: Device[] };
// "choose": ingen enhet aktiv när man tryckte spela. "switch": användaren vill byta enhet.
type Picker = { mode: "choose" | "switch"; devices: Device[] };

/** Styrknappar och enhetsbyte för Spotify. Stora tryckytor (minst 48 px). Fel visas som text under knapparna. */
export function SpotifyControls({ playing, device, deviceRestricted = false, supportsVolume = false, volume = null }: { playing: boolean; device: string | null; deviceRestricted?: boolean; supportsVolume?: boolean; volume?: number | null }) {
  const refresh = useRefreshSpotify();
  // Spotify kan vägra kommandon ("Restricted device") även när enheten inte är märkt som begränsad. Då minns kortet det för enheten.
  const [refusedDevice, setRefusedDevice] = useState<string | null>(null);
  const restricted = deviceRestricted || (device !== null && refusedDevice === device);
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

  // Volym: eget värde medan man drar, skickas en gång när man släppt (efter 300 ms), annars följer reglaget Spotify.
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (volumeTimer.current) clearTimeout(volumeTimer.current); }, []);
  const shownVolume = localVolume ?? volume ?? 0;
  function changeVolume(v: number) {
    setLocalVolume(v);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(async () => {
      setError(null);
      try {
        const res = await fetch("/api/control/spotify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "volume", volume: v }) });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(j?.error ?? "Det gick inte att ändra volymen.");
        }
      } catch {
        setError("Ingen kontakt med servern.");
      }
      await Promise.resolve(refresh());
      setLocalVolume(null);
    }, 300);
  }

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
    // Det tillfälliga läget släpps när servern har svarat, oavsett vad den säger: tog Spotify emot kommandot men inget spelar, ska kortet visa sanningen.
    setTimeout(() => {
      void Promise.resolve(refresh()).finally(() => setOptimistic(null));
    }, 400);
  }

  const send = (action: Action) =>
    run(async () => {
      if (action === "play" || action === "pause") setOptimistic(action === "play");
      const { ok, data } = await post({ action });
      if (ok) return done();
      setOptimistic(null);
      if (data?.code === "restricted_device") { setRefusedDevice(device); return; }
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
      // Vid byte behålls det VERKLIGA läget (spelar/pausad), inte det tillfälliga. Vid "ingen aktiv enhet" ville användaren spela.
      const { ok, data } = await post({ action: "transfer", deviceId: d.id, play: picker?.mode === "choose" ? true : playing });
      if (ok) return done();
      setError(data?.error ?? "Det gick inte att byta enhet.");
    });

  return (
    <div className="controls">
      {restricted ? (
        <p className="mid restricted-note">Spotify tillåter inte att {device ?? "den här enheten"} styrs från andra appar. Styr den i Spotify-appen, eller flytta musiken till en annan enhet med Byt enhet.</p>
      ) : (
      <div className="controls-row">
        <button type="button" className="ctl" aria-label="Föregående låt" disabled={busy} onClick={() => send("previous")}><SkipBack aria-hidden="true" /></button>
        <button type="button" className="ctl main" aria-label={shownPlaying ? "Pausa" : "Spela"} disabled={busy} onClick={() => send(shownPlaying ? "pause" : "play")}>
          {shownPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="ctl" aria-label="Nästa låt" disabled={busy} onClick={() => send("next")}><SkipForward aria-hidden="true" /></button>
      </div>
      )}
      {!restricted && device && (supportsVolume ? (
        <label className="volume" htmlFor="spotify-volume">
          <span>Volym</span>
          <input id="spotify-volume" type="range" min={0} max={100} step={1} value={shownVolume} aria-valuetext={`${shownVolume} procent`} onChange={(e) => changeVolume(Number(e.target.value))} />
          <span className="volume-value">{shownVolume}</span>
        </label>
      ) : (
        <p className="mid small">Volymen ändras på {device} (Spotify tillåter det inte härifrån).</p>
      ))}
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
