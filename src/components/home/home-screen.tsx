"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { HomeStates } from "@/server/snapshots";
import { Clock } from "./clock";
import { RefreshContext } from "./refresh-context";
import { AegCard, ArloCard, SkodaCard, SonosCard, SpotifyCard } from "./cards";
import { GoogleHomeTile } from "./google-home-tile";

const POLL_MS = 30_000;

export function HomeScreen({ initial, initialNow }: { initial: HomeStates; initialNow: string }) {
  const [states, setStates] = useState(initial);
  const [now, setNow] = useState(new Date(initialNow));
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (res.status === 401) return router.replace("/logga-in");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { states: HomeStates; now: string };
      setStates(json.states);
      setNow(new Date(json.now));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [router]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  return (
    <RefreshContext.Provider value={refresh}>
    <div className="wrap">
      <header className="top-bar"><Clock /></header>
      {offline && <p className="err" role="status">Ingen kontakt med servern. Visar senast hämtade data.</p>}
      <main className="grid">
        <SkodaCard state={states.skoda} now={now} />
        <SonosCard state={states.sonos} now={now} />
        <SpotifyCard state={states.spotify} now={now} />
        <AegCard state={states.aeg} now={now} />
        <ArloCard state={states.arlo} now={now} />
        <GoogleHomeTile />
      </main>
    </div>
    </RefreshContext.Provider>
  );
}
