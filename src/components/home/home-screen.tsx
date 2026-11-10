"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { HomeStates } from "@/server/snapshots";
import { resolveCards, type AppSettings } from "@/lib/settings";
import type { DepartureView } from "@/lib/departure";
import { NightVeil } from "./night-veil";
import { Settings as SettingsIcon } from "lucide-react";
import { ListsCard } from "./lists-card";
import { attentionLine, attentionTone } from "./attention";
import type { SonosInfo } from "./spotify-view";
import { Clock } from "./clock";
import { dinnerTodayLine, peopleFor } from "@/lib/dinner";
import { listsSchema } from "@/server/providers/schemas";
import { localDate } from "@/server/calendar/time";
import { RefreshContext, SpotifyRefreshContext } from "./refresh-context";
import { AegCard, CalendarCard, SkodaCard, SonosCard, SpotifyCard, TadoCard, WeatherCard } from "./cards";

const POLL_MS = 30_000;
/** Spotify uppdateras oftare (direkt från Spotify) så att kortet följer vad som spelas utan märkbar fördröjning. */
const SPOTIFY_POLL_MS = 4_000;

export function HomeScreen({ initial, initialNow, initialSettings, initialDeparture }: { initial: HomeStates; initialNow: string; initialSettings: AppSettings; initialDeparture: DepartureView }) {
  const [states, setStates] = useState(initial);
  const [settings, setSettings] = useState(initialSettings);
  const [departure, setDeparture] = useState(initialDeparture);
  const [now, setNow] = useState(new Date(initialNow));
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (res.status === 401) return router.replace("/logga-in");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { states: HomeStates; now: string; settings?: AppSettings; departure?: DepartureView };
      setStates(json.states);
      if (json.settings) setSettings(json.settings);
      if (json.departure) setDeparture(json.departure);
      setNow(new Date(json.now));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [router]);

  const spotifyConnected = states.spotify !== undefined && states.spotify.status !== "not_connected";
  const refreshSpotify = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { state?: HomeStates["spotify"] };
      if (json.state) setStates((s) => ({ ...s, spotify: json.state }));
    } catch {
      // Tillfälligt nätfel: nästa runda försöker igen.
    }
  }, []);

  useEffect(() => {
    if (!spotifyConnected) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refreshSpotify(); }, SPOTIFY_POLL_MS);
    return () => clearInterval(t);
  }, [spotifyConnected, refreshSpotify]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  // Sonos-rummen till Spotify-kortet: knappar och enhetsbyte går via Sonos när musiken spelar där.
  const visible = resolveCards(settings);
  const sonosState = states.sonos;
  const sonosInfo = sonosState && (sonosState.status === "ok" || sonosState.status === "stale") ? (sonosState.data as SonosInfo) : null;

  const listsParsed = states.lists && (states.lists.status === "ok" || states.lists.status === "stale") ? listsSchema.safeParse(states.lists.data) : null;
  const dinnerLine = listsParsed?.success && visible.includes("lists") ? dinnerTodayLine(listsParsed.data.dinners, peopleFor(localDate(now), listsParsed.data.people, listsParsed.data.peopleEven), localDate(now)) : null;

  return (
    <RefreshContext.Provider value={refresh}>
    <SpotifyRefreshContext.Provider value={refreshSpotify}>
    <div className="wrap">
      <NightVeil night={settings.night} />
      <header className="top-bar">
        <Clock note={attentionLine(states, now) ?? dinnerLine} tone={attentionTone(states, now)} trailing={<a className="settings-link" href="/installningar" aria-label="Inställningar"><SettingsIcon aria-hidden="true" /></a>} />
      </header>
      {offline && <p className="err" role="status">Ingen kontakt med servern. Visar senast hämtade data.</p>}
      {visible.length === 0 && <p className="mid empty-note">Alla kort är dolda. Slå på något under Inställningar.</p>}
      <main className="grid">
        {visible.map((id) => {
          switch (id) {
            case "weather": return <WeatherCard key={id} state={states.weather} now={now} />;
            case "lists": return <ListsCard key={id} state={states.lists} now={now} />;
            case "calendar": return <CalendarCard key={id} state={states.calendar} now={now} />;
            case "spotify": return <SpotifyCard key={id} state={states.spotify} now={now} sonos={sonosInfo} />;
            case "aeg": return <AegCard key={id} state={states.aeg} now={now} />;
            case "tado": return <TadoCard key={id} state={states.tado} now={now} />;
            case "skoda": return <SkodaCard key={id} state={states.skoda} now={now} departure={departure} onDeparture={setDeparture} />;
            case "sonos": return <SonosCard key={id} state={states.sonos} now={now} />;
          }
        })}
      </main>
    </div>
    </SpotifyRefreshContext.Provider>
    </RefreshContext.Provider>
  );
}
