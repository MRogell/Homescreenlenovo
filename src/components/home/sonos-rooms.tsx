"use client";
import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import type { SonosData } from "@/server/providers/schemas";
import { useRefresh } from "./refresh-context";

type Group = SonosData["groups"][number];

/** Ett Sonos-rum: namn, låt och knappar (spela/pausa, nästa). */
function Room({ g }: { g: Group }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const playing = optimistic ?? g.playing;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptimistic(null);
  }, [g.playing]);

  async function send(action: "play" | "pause" | "next") {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (action !== "next") setOptimistic(action === "play");
    try {
      const res = await fetch("/api/control/sonos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, groupId: g.id }) });
      if (!res.ok) {
        setOptimistic(null);
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Det gick inte att styra Sonos.");
      } else {
        setTimeout(() => void refresh(), 700);
      }
    } catch {
      setOptimistic(null);
      setError("Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sonos-room">
      <div className="sonos-info">
        <strong>{g.room}</strong>
        {g.members.length > 0 && <span className="members">+ {g.members.join(", ")}</span>}
        <span className="mid">{g.title}{g.artist && ` · ${g.artist}`}</span>
        {error && <span className="err" role="alert">{error}</span>}
      </div>
      <div className="sonos-buttons">
        <button type="button" className={`ctl${playing ? " main" : ""}`} aria-label={`${playing ? "Pausa" : "Spela"} i ${g.room}`} disabled={busy} onClick={() => send(playing ? "pause" : "play")}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="ctl" aria-label={`Nästa låt i ${g.room}`} disabled={busy} onClick={() => send("next")}><SkipForward aria-hidden="true" /></button>
      </div>
    </div>
  );
}

export function SonosRooms({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return <p className="mid">Inga Sonos-rum hittades.</p>;
  return <div className="sonos-rooms">{groups.map((g) => <Room key={g.id} g={g} />)}</div>;
}
