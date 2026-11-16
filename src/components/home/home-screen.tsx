"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeStates } from "@/server/snapshots";
import { type AppSettings, type CardId } from "@/lib/settings";
import { isQuietHours, QUIET_POLL_MS } from "@/lib/quiet";
import { isFree, moveTo, orderedCards, stepCard, type CardSize } from "@/lib/layout";
import { useFirstRowFit } from "./first-row-fit";
import { resetLayout, useLayout, writeLayout } from "@/lib/layout-store";
import { EditBar } from "./edit-bar";
import { EditContext } from "./edit-context";
import type { DepartureView } from "@/lib/departure";
import { NightVeil } from "./night-veil";
import { Pencil, Settings as SettingsIcon } from "lucide-react";
import { ListsCard } from "./lists-card";
import { attentionLine, attentionTone } from "./attention";
import type { SonosInfo } from "./spotify-view";
import { Clock } from "./clock";
import { dinnerToday, isChildWeek, peopleFor } from "@/lib/dinner";
import { useLists } from "../lists/use-lists";
import { PickupBar } from "../lists/pickup-bar";
import { WeekChipButton } from "./home-this-week";
import { awayToday } from "./calendar-view";
import { TimerChip } from "./timer-chip";
import type { TimerItem } from "@/lib/smart";
import { listsSchema } from "@/server/providers/schemas";
import { localDate } from "@/server/calendar/time";
import { RefreshContext, SpotifyRefreshContext } from "./refresh-context";
import { AegCard, CalendarCard, SkodaCard, SonosCard, SpotifyCard, TadoCard, WeatherCard } from "./cards";

function ChildWeekBadge({ now, awayIds }: { now: Date; awayIds: string[] }) {
  return isChildWeek(localDate(now)) ? <WeekChipButton now={now} awayIds={awayIds} className="week-badge">Barnvecka</WeekChipButton> : null;
}

// Gratisdatabasen räknar anrop: hemskärmen hämtas var 2:a minut (egna ändringar och tryck uppdaterar direkt).
const POLL_MS = 120_000;
/** Spotify uppdateras oftare (direkt från Spotify) så att kortet följer vad som spelas utan märkbar fördröjning. */
const SPOTIFY_POLL_MS = 4_000;
/** När inget spelas räcker det att fråga Spotify var 15:e sekund. */
const SPOTIFY_IDLE_MS = 15_000;

export function HomeScreen({ initial, initialNow, initialSettings, initialDeparture, initialTimers = [] }: { initial: HomeStates; initialNow: string; initialSettings: AppSettings; initialDeparture: DepartureView; initialTimers?: TimerItem[] }) {
  const [states, setStates] = useState(initial);
  const [settings, setSettings] = useState(initialSettings);
  const [departure, setDeparture] = useState(initialDeparture);
  const [timers, setTimers] = useState(initialTimers);
  const [now, setNow] = useState(new Date(initialNow));
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (res.status === 401) return router.replace("/logga-in");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { states: HomeStates; now: string; settings?: AppSettings; departure?: DepartureView; timers?: TimerItem[] };
      setStates(json.states);
      if (json.settings) setSettings(json.settings);
      if (json.departure) setDeparture(json.departure);
      if (json.timers) setTimers(json.timers);
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

  // Hämtningarna är glesare när det inte behövs: Spotify var 15:e sekund när inget spelas, och på natten sällan alls (se lib/quiet.ts).
  const nightRef = useRef(settings.night);
  const playingRef = useRef(false);
  useEffect(() => { nightRef.current = settings.night; }, [settings.night]);
  const sp = states.spotify;
  useEffect(() => { playingRef.current = !!sp && (sp.status === "ok" || sp.status === "stale") && (sp.data as { playing?: boolean } | undefined)?.playing === true; }, [sp]);

  useEffect(() => {
    if (!spotifyConnected) return;
    let last = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const wait = isQuietHours(new Date(), nightRef.current) ? QUIET_POLL_MS : playingRef.current ? 0 : SPOTIFY_IDLE_MS;
      if (Date.now() - last < wait) return;
      last = Date.now();
      void refreshSpotify();
    }, SPOTIFY_POLL_MS);
    return () => clearInterval(t);
  }, [spotifyConnected, refreshSpotify]);

  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (isQuietHours(new Date(), nightRef.current) && Date.now() - last < QUIET_POLL_MS) return;
      last = Date.now();
      void refresh();
    };
    const t = setInterval(tick, POLL_MS);
    // När någon öppnar appen igen hämtas direkt, även på natten.
    const onShow = () => { if (document.visibilityState === "visible") { last = Date.now(); void refresh(); } };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [refresh]);

  // Sonos-rummen till Spotify-kortet: knappar och enhetsbyte går via Sonos när musiken spelar där.
  const layout = useLayout();
  const [editing, setEditing] = useState(false);
  const gridRef = useRef<HTMLElement>(null);
  const visible = orderedCards(layout, settings.cards.order, settings.cards.hidden);
  useFirstRowFit(gridRef, isFree(layout), [states, settings, layout, editing, timers, departure]);
  // Egen ordning sparas för hela listan (även dolda kort), så att ordningen består om ett dolt kort slås på igen.
  const fullOrder = (): CardId[] => layout.order ?? [...settings.cards.order];
  const editApi = {
    editing,
    order: visible,
    move: (id: CardId, delta: -1 | 1) => { const vis = stepCard(visible, id, delta); writeLayout({ ...layout, order: [...vis, ...fullOrder().filter((x) => !vis.includes(x))] }); },
    dropOn: (id: CardId, target: CardId) => { const vis = moveTo(visible, id, target); writeLayout({ ...layout, order: [...vis, ...fullOrder().filter((x) => !vis.includes(x))] }); },
    setSize: (id: CardId, size: CardSize) => { const sizes = { ...layout.sizes }; if (size === "m") delete sizes[id]; else sizes[id] = size; writeLayout({ ...layout, sizes }); },
    sizeOf: (id: CardId): CardSize => layout.sizes[id] ?? "m",
  };
  const sonosState = states.sonos;
  const sonosInfo = sonosState && (sonosState.status === "ok" || sonosState.status === "stale") ? (sonosState.data as SonosInfo) : null;

  const listsParsed = states.lists && (states.lists.status === "ok" || states.lists.status === "stale") ? listsSchema.safeParse(states.lists.data) : null;
  // En enda uppsättning av listorna för hela skärmen: inköpskortet och "Vem hämtar?" delar den.
  const listsApi = useLists(listsParsed?.success ? listsParsed.data : null, { quiet: () => isQuietHours(new Date(), nightRef.current) });
  const hidePickup = useCallback(async () => {
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ show: { ...settings.show, pickup: false } }) });
    } finally {
      void refresh();
    }
  }, [settings.show, refresh]);
  const dinner = listsParsed?.success && visible.includes("lists") ? dinnerToday(listsParsed.data.dinners, peopleFor(localDate(now), listsParsed.data.people, listsParsed.data.peopleEven), localDate(now)) : null;

  return (
    <RefreshContext.Provider value={refresh}>
    <SpotifyRefreshContext.Provider value={refreshSpotify}>
    <EditContext.Provider value={editApi}>
    <div className={`wrap home${editing ? " editing" : ""}`}>
      <NightVeil night={settings.night} />
      <header className="top-bar">
        <Clock extras={<>{settings.smart.timer.enabled && <TimerChip timers={timers} onChange={setTimers} />}{settings.show.childWeek && <ChildWeekBadge now={now} awayIds={awayToday(states.calendar)} />}{settings.show.pickup && visible.includes("lists") && <PickupBar api={listsApi} onHide={hidePickup} />}</>} note={attentionLine(states, now)} dinner={dinner} tone={attentionTone(states, now)} trailing={<span className="trail"><button type="button" className="settings-link" aria-label="Redigera hemskärmen" aria-pressed={editing} onClick={() => setEditing((v) => !v)}><Pencil aria-hidden="true" /></button><a className="settings-link" href="/installningar" aria-label="Inställningar"><SettingsIcon aria-hidden="true" /></a></span>} />
      </header>
      {offline && <p className="err" role="status">Ingen kontakt med servern. Visar senast hämtade data.</p>}
      {visible.length === 0 && <p className="mid empty-note">Alla kort är dolda. Slå på något under Inställningar.</p>}
      <main className="grid" ref={gridRef}>
        {visible.map((id) => {
          switch (id) {
            case "weather": return <WeatherCard key={id} state={states.weather} now={now} />;
            case "lists": return <ListsCard key={id} state={states.lists} now={now} api={listsApi} />;
            case "calendar": return <CalendarCard key={id} state={states.calendar} now={now} />;
            case "spotify": return <SpotifyCard key={id} state={states.spotify} now={now} sonos={sonosInfo} />;
            case "aeg": return <AegCard key={id} state={states.aeg} now={now} />;
            case "tado": return <TadoCard key={id} state={states.tado} now={now} />;
            case "skoda": return <SkodaCard key={id} state={states.skoda} now={now} departure={departure} onDeparture={setDeparture} />;
            case "sonos": return <SonosCard key={id} state={states.sonos} now={now} />;
          }
        })}
      </main>
      {editing && <EditBar layout={layout} onChange={writeLayout} onReset={resetLayout} onDone={() => setEditing(false)} />}
    </div>
    </EditContext.Provider>
    </SpotifyRefreshContext.Provider>
    </RefreshContext.Provider>
  );
}
