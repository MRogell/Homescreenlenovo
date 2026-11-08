"use client";
import { ChevronDown, Pause, Play, SkipBack, SkipForward, Speaker, Volume1, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRefresh, useRefreshSpotify } from "./refresh-context";
import { buildDeviceList, findSonosGroup, type DeviceItem, type SonosInfo, type SpotifyDeviceInfo } from "./spotify-view";

type Action = "play" | "pause" | "next" | "previous";
type ApiBody = { error?: string; code?: string; devices?: SpotifyDeviceInfo[] };
// "choose": ingen enhet aktiv när man tryckte spela. "switch": användaren vill byta enhet.
type Picker = { mode: "choose" | "switch"; devices: SpotifyDeviceInfo[] };

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Styrknappar, volym och enhetsbyte. Spelar Spotify i ett Sonos-rum går knapparna och volymen via Sonos
 * (Spotify vägrar ofta styra Sonos), och byte mellan Sonos-rum görs av Sonos så att musiken följer med.
 */
export function SpotifyControls({ playing, device, supportsVolume = false, volume = null, sonos = null }: { playing: boolean; device: string | null; deviceRestricted?: boolean; supportsVolume?: boolean; volume?: number | null; sonos?: SonosInfo | null }) {
  const refreshSpotify = useRefreshSpotify();
  const refreshHome = useRefresh();
  const sonosGroup = findSonosGroup(device, sonos);
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

  const refreshAll = () => Promise.all([Promise.resolve(refreshSpotify()), sonosGroup || sonos ? Promise.resolve(refreshHome()) : null]);

  // Volym: eget värde medan man drar, skickas en gång när man släppt (efter 300 ms), annars följer reglaget Spotify/Sonos.
  const canVolume = sonosGroup ? sonosGroup.volume !== null : supportsVolume;
  const serverVolume = sonosGroup ? sonosGroup.volume : volume;
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (volumeTimer.current) clearTimeout(volumeTimer.current); }, []);
  const shownVolume = localVolume ?? serverVolume ?? 0;
  function changeVolume(v: number) {
    setLocalVolume(v);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(async () => {
      setError(null);
      try {
        const [url, body] = sonosGroup ? ["/api/control/sonos", { action: "volume", groupId: sonosGroup.id, volume: v }] : ["/api/control/spotify", { action: "volume", volume: v }];
        const res = await fetch(url as string, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(j?.error ?? "Det gick inte att ändra volymen.");
        }
      } catch {
        setError("Ingen kontakt med servern.");
      }
      await refreshAll();
      setLocalVolume(null);
    }, 300);
  }

  async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: ApiBody | null }> {
    const res = await fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
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
    // Knapparna släpps direkt; kortet hämtar ny status i bakgrunden när tjänsten hunnit uppdatera sig.
    setTimeout(() => {
      void refreshAll().finally(() => setOptimistic(null));
    }, 400);
  }

  const send = (action: Action) =>
    run(async () => {
      if (action === "play" || action === "pause") setOptimistic(action === "play");
      const { ok, data } = sonosGroup ? await post("/api/control/sonos", { action, groupId: sonosGroup.id }) : await post("/api/control/spotify", { action });
      if (ok) return done();
      setOptimistic(null);
      if (data?.code === "choose_device" && data.devices?.length) return setPicker({ mode: "choose", devices: data.devices });
      setPicker(null);
      setError(data?.code === "restricted_device" ? `${device ?? "Enheten"} går inte att styra härifrån. Välj en annan enhet.` : data?.error ?? "Det gick inte att styra musiken.");
    });

  const openSwitcher = () =>
    run(async () => {
      if (picker?.mode === "switch") return setPicker(null);
      const { ok, data } = await post("/api/control/spotify", { action: "devices" });
      const devices = ok ? data?.devices ?? [] : [];
      if (!devices.length && !sonos?.players.length) return setError(ok ? "Inga enheter hittades. Öppna Spotify på den enhet du vill använda." : data?.error ?? "Det gick inte att hämta enheter.");
      setPicker({ mode: "switch", devices });
    });

  const moveTo = (d: DeviceItem) =>
    run(async () => {
      // Mellan Sonos-rum: Sonos flyttar musiken. Annars Spotify (med det VERKLIGA läget; vid "ingen aktiv enhet" ville användaren spela).
      const res = d.kind === "sonos" && sonosGroup && d.playerId
        ? await post("/api/control/sonos", { action: "move", fromGroupId: sonosGroup.id, toPlayerId: d.playerId })
        : d.spotifyId
          ? await post("/api/control/spotify", { action: "transfer", deviceId: d.spotifyId, play: picker?.mode === "choose" ? true : playing })
          : { ok: false, data: null };
      if (res.ok) return done();
      setError(res.data?.error ?? "Det gick inte att byta enhet.");
    });

  // Listan stängs vid klick utanför eller Escape.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setPicker(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicker(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [picker]);

  const items = picker ? buildDeviceList(picker.devices, sonos, picker.mode === "switch" ? sonosGroup?.id ?? null : null) : [];

  return (
    <div className="controls">
      <div className="controls-row">
        <button type="button" className="ctl" aria-label="Föregående låt" disabled={busy} onClick={() => send("previous")}><SkipBack aria-hidden="true" /></button>
        <button type="button" className="ctl main" aria-label={shownPlaying ? "Pausa" : "Spela"} disabled={busy} onClick={() => send(shownPlaying ? "pause" : "play")}>
          {shownPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="ctl" aria-label="Nästa låt" disabled={busy} onClick={() => send("next")}><SkipForward aria-hidden="true" /></button>
      </div>
      {device && canVolume && (
        <label className="volume sp-volume" htmlFor="spotify-volume">
          <Volume1 aria-hidden="true" />
          <span className="sr-only">Volym</span>
          <input id="spotify-volume" type="range" min={0} max={100} step={1} value={shownVolume} aria-valuetext={`${shownVolume} procent`} style={{ "--vol": `${shownVolume}%` } as React.CSSProperties} onChange={(e) => changeVolume(Number(e.target.value))} />
          <Volume2 aria-hidden="true" />
        </label>
      )}
      <div className="sp-device-wrap" ref={wrapRef}>
      <button type="button" className="sp-device" aria-expanded={!!picker} aria-haspopup="true" aria-label={`Byt enhet, nu ${device ?? "ingen aktiv"}`} disabled={busy} onClick={openSwitcher}>
        <Speaker aria-hidden="true" />
        <span>{device ?? "Välj enhet"}</span>
        <ChevronDown aria-hidden="true" className={picker?.mode === "switch" ? "open" : ""} />
      </button>
      {picker && (
        // Öppnas ovanpå kortet: kortets storlek (och därmed hela rutnätet) ändras aldrig.
        <div className="devices sp-popover" role="group" aria-label="Välj enhet">
          {items.map((d) => (
            <button key={d.key} type="button" className="device" disabled={busy || d.active || !d.available} aria-current={d.active ? "true" : undefined} onClick={() => moveTo(d)}>
              {d.name}
              <span>{d.active ? "Spelar här" : d.type}</span>
            </button>
          ))}
        </div>
      )}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
