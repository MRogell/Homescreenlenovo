"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { HomeStates } from "@/server/snapshots";
import { CARD_ORDER } from "./card-order";
import { Clock } from "./clock";
import { RefreshContext } from "./refresh-context";
import { AegCard, ArloUnsupportedCard, SkodaCard, SonosCard, SpotifyCard, TadoCard, WeatherCard } from "./cards";

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
        {CARD_ORDER.map((id) => {
          switch (id) {
            case "weather": return <WeatherCard key={id} state={states.weather} now={now} />;
            case "spotify": return <SpotifyCard key={id} state={states.spotify} now={now} />;
            case "aeg": return <AegCard key={id} state={states.aeg} now={now} />;
            case "tado": return <TadoCard key={id} state={states.tado} now={now} />;
            case "arlo": return <ArloUnsupportedCard key={id} />;
            case "skoda": return <SkodaCard key={id} state={states.skoda} now={now} />;
            case "sonos": return <SonosCard key={id} state={states.sonos} now={now} />;
          }
        })}
      </main>
    </div>
    </RefreshContext.Provider>
  );
}
