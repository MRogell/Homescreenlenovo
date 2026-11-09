"use client";
import { Music, Pause, Play, SkipBack, SkipForward, Volume1, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SonosData } from "@/server/providers/schemas";
import { useRefresh } from "./refresh-context";
import { sonosView } from "./sonos-view";

type Group = SonosData["groups"][number];
type Action = "play" | "pause" | "next" | "previous";

/** Omslaget, eller en neutral not när bild saknas. */
function Cover({ url }: { url: string | null }) {
  if (!url) return <Music aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- extern omslagsbild, ingen optimering behövs
  return <img src={url} alt="" referrerPolicy="no-referrer" />;
}

/**
 * Sonos: det rum som spelar visas stort (omslag, låt, knappar, volym), övriga rum är val att starta eller pausa.
 * Tryck går direkt till rummet. Visningen följer trycket tills Sonos svarat med sitt nya läge.
 */
export function SonosNow({ groups }: { groups: Group[] }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tillfälligt läge per rum. Gäller bara så länge servern visar samma läge som när trycket gjordes (sig), sedan släpps det.
  const sig = groups.map((g) => `${g.id}:${g.playing}`).join(",");
  const [pending, setPending] = useState<{ sig: string; map: Record<string, boolean> }>({ sig: "", map: {} });
  const optimistic = pending.sig === sig ? pending.map : {};
  const isPlaying = (g: Group) => optimistic[g.id] ?? g.playing;

  const { hero, chips } = sonosView(groups);
  const heroGroup = hero ? groups.find((g) => g.id === hero.id) : undefined;

  async function send(id: string, action: Action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (action === "play" || action === "pause") setPending({ sig, map: { ...optimistic, [id]: action === "play" } });
    try {
      const res = await fetch("/api/control/sonos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, groupId: id }) });
      if (!res.ok) {
        setPending({ sig, map: {} });
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Det gick inte att styra Sonos.");
      } else {
        setTimeout(() => void refresh(), 700);
      }
    } catch {
      setPending({ sig, map: {} });
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  // Volym: eget värde medan man drar, skickas en gång när man släppt (efter 300 ms).
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function changeVolume(groupId: string, v: number) {
    setLocalVolume(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setError(null);
      try {
        const res = await fetch("/api/control/sonos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "volume", groupId, volume: v }) });
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

  if (groups.length === 0) return <p className="mid">Inga Sonos-rum hittades.</p>;
  const heroPlaying = heroGroup ? isPlaying(heroGroup) : false;
  const volume = localVolume ?? hero?.volume ?? null;

  return (
    <div className="sn">
      {hero ? (
        <>
          <div className="sn-hero">
            <div className="sn-art"><Cover url={hero.imageUrl} /></div>
            <div className="sn-meta">
              <div className="sn-room"><span className={`sn-eq${heroPlaying ? "" : " off"}`} aria-hidden="true"><i /><i /><i /></span><span>{hero.name}{hero.extra && ` + ${hero.extra}`}</span></div>
              <div className="sn-title" title={hero.title}>{hero.title}</div>
              {hero.artist && <div className="sn-artist">{hero.artist}</div>}
            </div>
          </div>
          <div className="sn-ctl">
            <button type="button" className="ctl" aria-label={`Föregående låt i ${hero.name}`} disabled={busy} onClick={() => send(hero.id, "previous")}><SkipBack aria-hidden="true" /></button>
            <button type="button" className="ctl main sn-play" aria-label={`${heroPlaying ? "Pausa" : "Spela"} i ${hero.name}`} disabled={busy} onClick={() => send(hero.id, heroPlaying ? "pause" : "play")}>{heroPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
            <button type="button" className="ctl" aria-label={`Nästa låt i ${hero.name}`} disabled={busy} onClick={() => send(hero.id, "next")}><SkipForward aria-hidden="true" /></button>
            {volume !== null && (
              <label className="sn-vol" htmlFor="sonos-volume">
                <Volume1 aria-hidden="true" />
                <span className="sr-only">Volym i {hero.name}</span>
                <input id="sonos-volume" type="range" min={0} max={100} step={1} value={volume} aria-valuetext={`${volume} procent`} style={{ "--v": `${volume}%` } as React.CSSProperties} onChange={(e) => changeVolume(hero.id, Number(e.target.value))} />
                <Volume2 aria-hidden="true" />
              </label>
            )}
          </div>
        </>
      ) : (
        <div className="sn-hero">
          <div className="sn-art"><Music aria-hidden="true" /></div>
          <div className="sn-meta"><div className="sn-title">Inget spelas</div><div className="sn-artist">Välj ett rum nedan</div></div>
        </div>
      )}
      {chips.length > 0 && (
        <div className="sn-chips" role="group" aria-label="Rum">
          {chips.map((c) => {
            const g = groups.find((x) => x.id === c.id)!;
            const on = isPlaying(g);
            return (
              <button key={c.id} type="button" className={`sn-chip${on ? " on" : ""}`} disabled={busy} aria-label={on ? `${c.label}, spelar. Tryck för att pausa` : undefined} onClick={() => send(c.id, on ? "pause" : "play")}>
                {on ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                {c.label}
                {!on && <small>spela här</small>}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
