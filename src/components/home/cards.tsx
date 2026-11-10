import { formatClock, formatMinutes, formatTemp } from "@/lib/format";
import type { CardState } from "@/server/providers/types";
import type { AegData, CalendarData, SkodaData, SonosData, SpotifyData, TadoData, WeatherData } from "@/server/providers/schemas";
import { CardShell } from "./card-shell";
import { Icon, type IconName } from "./icons";
import type { DepartureView } from "@/lib/departure";
import { skodaView } from "./skoda-view";
import { SkodaClimate } from "./skoda-climate";
import { DepartureRow } from "./departure-row";
import { localDate } from "@/server/calendar/time";
import { weekChip } from "@/lib/dinner";
import { weatherView, wxTint } from "./weather-view";
import { WeatherIcon } from "./weather-icon";
import { Droplets, Moon, Snowflake, Sun, Sunrise, Sunset, Wind } from "lucide-react";
import { SonosNow } from "./sonos-now";
import { TadoDial } from "./tado-dial";
import { tadoSummary, tadoView } from "./tado-view";
import { calendarView, type CalEventRow } from "./calendar-view";
import { AegControls } from "./aeg-controls";
import { AegProgram } from "./aeg-program";
import { SpotifyControls } from "./spotify-controls";
import { SpotifyArt } from "./spotify-art";
import { SpotifyProgress } from "./spotify-progress";
import type { SonosInfo } from "./spotify-view";

type S<T> = CardState<unknown> | undefined;
const as = <T,>(s: S<T>) => s as CardState<T> | undefined;
type P = { state: CardState<unknown> | undefined; now: Date };

const CHECK_ICON: Record<string, IconName> = { Lås: "lock", Dörrar: "door", Fönster: "window", Bagage: "trunk", Motorhuv: "car" };

export const SkodaCard = ({ state, now, departure, onDeparture }: P & { departure?: DepartureView | null; onDeparture?: (v: DepartureView) => void }) => (
  <CardShell<SkodaData> title="Škoda" off={{ big: "Bilen", text: "Se laddning och starta klimatet." }} icon="car" state={as(state)} now={now} className="skoda" render={(d) => {
    const v = skodaView(d, now);
    return {
      pill: v.pill,
      body: <div className="skoda-body"><div className="skoda-info">
        <div className="skoda-main">
          <div className="big">{d.rangeKm ?? "–"}<small>km</small></div>
          {v.levelText && <div className="skoda-level"><strong>{d.levelPct}<small>%</small></strong><span>{d.levelKind === "battery" ? "batteri" : "tank"}</span></div>}
        </div>
        {d.levelPct !== null && (
          <div className={`bar skoda-bar${d.levelPct <= 20 ? " low" : ""}`} role="img" aria-label={v.levelText ?? undefined}>
            <i style={{ width: `${d.levelPct}%` }} />
            {v.targetPct !== null && <b className="skoda-target" style={{ left: `${v.targetPct}%` }} aria-hidden="true" />}
          </div>
        )}
        {v.chargeLine && <div className="skoda-charge"><Icon name="bolt" />{v.chargeLine}</div>}
        {v.checks.length > 0 && (
          <ul className="skoda-checks" aria-label="Status">
            {v.checks.map((c) => (
              <li key={c.label} className={c.tone}><Icon name={CHECK_ICON[c.label] ?? "car"} /><span><strong>{c.value}</strong><small>{c.label}</small></span></li>
            ))}
          </ul>
        )}
      </div>
        <SkodaClimate on={v.climate.on} targetC={v.climate.targetC} text={v.climate.text} pending={v.climate.pending} />
        {departure && onDeparture && <DepartureRow view={departure} onChange={onDeparture} />}
        <div className="skoda-place">
          <Icon name="pin" />
          <span><span className="addr" title={v.placeFull ?? undefined}>{v.place}</span>{v.reported && <small>{v.reported}</small>}{v.batteryNote && <small className="stale">{v.batteryNote}</small>}</span>
        </div>
      </div>,
    };
  }} />
);

export const SonosCard = ({ state, now }: P) => (
  <CardShell<SonosData> title="Sonos" off={{ big: "Rummen", text: "Styr högtalarna i huset." }} icon="spk" state={as(state)} now={now} className="sonos" render={(d) => {
    const playing = d.groups.filter((g) => g.playing).length;
    return {
      pill: playing > 0 ? { text: `Spelar i ${playing} rum`, tone: "ok" } : { text: "Tyst" },
      body: <SonosNow groups={d.groups} />,
    };
  }} />
);

export const SpotifyCard = ({ state, now, sonos = null }: P & { sonos?: SonosInfo | null }) => (
  <CardShell<SpotifyData> title="Spotify" off={{ big: "Musik", text: "Styr uppspelningen härifrån." }} icon="note" state={as(state)} now={now} className="spotify" render={(d) => ({
    pill: { text: d.playing ? "Spelar" : "Pausad", tone: d.playing ? "ok" : undefined },
    body: <>
      <div className="sp-top">
        <SpotifyArt url={d.imageUrl} dim={!d.playing} />
        <div className="sp-meta">
          <div className="sp-title" title={d.title}>{d.title}</div>
          {d.artist && <div className="sp-artist" title={d.artist}>{d.artist}</div>}
          <div className="sp-where">{d.playing ? (d.device ? `på ${d.device}` : null) : d.lastPlayedAt ? `senast ${formatClock(d.lastPlayedAt)}` : null}</div>
        </div>
      </div>
      <SpotifyProgress progressMs={d.progressMs} durationMs={d.durationMs} playing={d.playing} fetchedAt={state && "fetchedAt" in state ? state.fetchedAt : null} />
      <SpotifyControls playing={d.playing} device={d.device} deviceRestricted={d.deviceRestricted} supportsVolume={d.supportsVolume} volume={d.volume} sonos={sonos} />
    </>,
  })} />
);

export const AegCard = ({ state, now }: P) => (
  <CardShell<AegData> title="AEG" off={{ big: "Maskinen", text: "Följ programmet och starta eller stoppa." }} icon="wash" state={as(state)} now={now} className="aeg" render={(d) => {
    const active = d.state === "RUNNING" || d.state === "PAUSED" || d.state === "DELAYED_START";
    return {
      // Stor text visar läget; pillret visar uppkoppling, eller läget när maskinen kör (då är stora texten tiden kvar).
      pill: !d.connected ? { text: "Offline", tone: "bad" } : active ? { text: d.stateText, tone: "warn" } : { text: "Online", tone: "ok" },
      body: <>
        {active && d.minutesLeft !== null
          ? <div className="big">{formatMinutes(d.minutesLeft)}<small>kvar</small></div>
          : <div className="big text">{d.stateText}</div>}
        <div className="mid">{d.appliance}{d.program && <> · <AegProgram label={d.program} currentUid={d.programUid} programs={d.programs} canChange={d.connected && (d.state === "READY_TO_START" || d.state === "IDLE") && (d.remoteControl === null || d.remoteControl === "ENABLED")} /></>}{d.phase && active && ` · ${d.phase}`}{d.doneAt && ` · klar ca ${formatClock(d.doneAt)}`}</div>
        {d.connected && <AegControls state={d.state} remoteControl={d.remoteControl} />}
      </>,
    };
  }} />
);

export const WeatherCard = ({ state, now }: P) => (
  <CardShell<WeatherData> title="Väder" icon="cloud" state={as(state)} now={now} className="weather"
    style={(d) => ({ "--wx-tint": wxTint(d.code, d.isDay) }) as React.CSSProperties}
    render={(d) => {
      const v = weatherView(d, now);
      return {
        pill: d.aqiLabel ? { text: `Luft: ${d.aqiLabel}`, tone: d.aqi !== null && d.aqi <= 40 ? "ok" : d.aqi !== null && d.aqi <= 60 ? undefined : "warn" } : undefined,
        body: <>
          <div className="wx-now">
            <WeatherIcon icon={v.icon} className="wx-now-icon" />
            <div>
              <div className="big">{formatTemp(d.tempC)}<small>°C</small></div>
              <div className="mid"><strong>{d.text}</strong> · {d.place}{v.feelsLike && <> · {v.feelsLike}</>}</div>
            </div>
          </div>
          {v.hours.length > 0 && (
            <ol className="wx-hours" aria-label="Närmaste timmarna">
              {v.hours.map((h) => (
                <li key={h.label}>
                  <span className="wx-h">{h.label}</span>
                  <WeatherIcon icon={h.icon} />
                  <strong>{h.temp}</strong>
                  <span className={`wx-chance ${h.kind ?? ""}`}>{h.rain ?? "\u00a0"}</span>
                </li>
              ))}
            </ol>
          )}
          {v.days.length > 0 && (
            <ol className="wx-days" aria-label="Kommande dagar, natt och dag">
              <li className="wx-days-head" aria-hidden="true">
                <span /><span />
                <span className="wx-night-h"><Moon /> natt</span><span />
                <span className="wx-day-h"><Sun /> dag</span><span />
              </li>
              {v.days.map((x) => (
                <li key={x.label}>
                  <span className="wx-day">{x.label}</span>
                  <WeatherIcon icon={x.icon} />
                  <span className="wx-min" aria-label={`natt ${x.night}`}>{x.night}</span>
                  <span className="wx-range" aria-hidden="true"><i style={{ left: `${x.left}%`, width: `${x.width}%` }} /></span>
                  <span className="wx-max" aria-label={`dag ${x.day}`}>{x.day}</span>
                  {/* Alltid en cell, så att kolumnerna ligger lika på alla rader. Mix: bara siffror, ikonerna visar vilken som är vilken. */}
                  <span className={`wx-precip ${x.precip?.kind ?? ""}`} title={x.precip?.text} aria-label={x.precip?.text}>
                    {x.precip && (
                      <>
                        {x.precip.rain && <><Droplets aria-hidden="true" />{x.precip.kind === "mix" ? x.precip.rain.replace(" mm", "") : x.precip.rain}</>}
                        {x.precip.snow && <><Snowflake aria-hidden="true" />{x.precip.kind === "mix" ? x.precip.snow.replace(" cm", "") : x.precip.snow}</>}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="wx-meta">
            {v.sun && <span><Sunrise aria-hidden="true" />{v.sun.rise}<Sunset aria-hidden="true" />{v.sun.set}</span>}
            {v.wind && <span><Wind aria-hidden="true" />{v.wind}</span>}
          </div>
        </>,
      };
    }} />
);

export const TadoCard = ({ state, now }: P) => (
  <CardShell<TadoData> title="Inomhus" off={{ big: "Värmen", text: "Se temperaturen i varje rum." }} icon="temp" state={as(state)} now={now} className="tado" render={(d) => {
    const heating = d.rooms.filter((r) => r.heating).length;
    const rooms = tadoView(d.rooms);
    const sum = tadoSummary(d.rooms);
    return {
      pill: heating > 0 ? { text: `Värmer i ${heating} rum`, tone: "warn" } : { text: "Vilar" },
      body: rooms.length === 0 ? <p className="mid">Inga rum hittades i Tado.</p> : (
        <div className="ti-dials">
          {rooms.map((r) => <TadoDial key={r.name} r={r} />)}
          {sum && (
            <div className={`ti-sum span-${sum.span}`}>
              <span className="ti-avg">{sum.avg}</span>
              <span className="ti-cap">snitt i {sum.rooms} rum<br />{sum.heating > 0 ? <><b>{sum.heating}</b> värmer</> : "alla vilar"}</span>
            </div>
          )}
        </div>
      ),
    };
  }} />
);

const CalRow = ({ e }: { e: CalEventRow }) => (
  <div className="cal-ev" style={{ "--cal": `var(--c-${e.color})` } as React.CSSProperties}>
    <span className="cal-t">{e.time}</span>
    <i className="cal-dot" />
    <span className="cal-ti"><b>{e.title}</b><small>{e.meta}</small></span>
  </div>
);
const CalAllDay = ({ title, color }: { title: string; color: string }) => (
  <div className="cal-allday" style={{ "--cal": `var(--c-${color})` } as React.CSSProperties}><i className="cal-dot" />{title}</div>
);

/** Kalender: nästa händelse stort, resten av dagen och imorgon under. */
/** Vilken vecka det är och om det är barnvecka (udda veckor). */
function WeekChip({ now }: { now: Date }) {
  const w = weekChip(localDate(now));
  return <div className={`cal-week${w.child ? " child" : ""}`}>{w.text}</div>;
}

export const CalendarCard = ({ state, now }: P) => (
  <CardShell<CalendarData> title="Kalender" off={{ big: "Dagen", text: "Se dagens händelser från iCloud eller Google.", cta: "Lägg till kalender" }} icon="cal" state={as(state)} now={now} className="calendar" render={(d) => {
    const v = calendarView(d, now);
    return {
      pill: { text: v.pill },
      body: (
        <div className="cal">
          <WeekChip now={now} />
          {v.allDayToday.map((a, i) => <CalAllDay key={`t${i}`} {...a} />)}
          {v.allDayMore > 0 && <p className="cal-more">+{v.allDayMore} heldag</p>}
          {v.empty && <div className="cal-empty"><b>Inget i kalendern</b><span className="mid">Ingenting idag eller imorgon.</span></div>}
          {v.hero && (
            <div className="cal-next" style={{ "--cal": `var(--c-${v.hero.color})` } as React.CSSProperties}>
              <div className="cal-when"><i className="cal-dot" />{v.hero.when}</div>
              <div className="cal-ttl">{v.hero.title}</div>
              <div className="cal-meta">{v.hero.meta}</div>
            </div>
          )}
          {v.later.length > 0 && <><div className="cal-grp">Senare idag</div><div className="cal-rows">{v.later.map((e) => <CalRow key={e.key} e={e} />)}</div>{v.laterMore > 0 && <p className="cal-more">+{v.laterMore} till idag</p>}</>}
          {(v.tomorrow.allDay.length > 0 || v.tomorrow.events.length > 0) && (
            <div className="cal-tomorrow">
              <div className="cal-grp">Imorgon</div>
              {v.tomorrow.allDay.map((a, i) => <CalAllDay key={`m${i}`} {...a} />)}
              {v.tomorrow.events.map((e) => <CalRow key={e.key} e={e} />)}
              {v.tomorrow.more > 0 && <p className="cal-more">+{v.tomorrow.more} till imorgon</p>}
            </div>
          )}
          {v.note && <p className="mid small">{v.note}</p>}
        </div>
      ),
    };
  }} />
);
