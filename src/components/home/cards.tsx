import { formatClock, formatMinutes, formatTemp, formatTempShort } from "@/lib/format";
import type { CardState } from "@/server/providers/types";
import type { AegData, SkodaData, SonosData, SpotifyData, TadoData, WeatherData } from "@/server/providers/schemas";
import { CardShell } from "./card-shell";
import { Icon, type IconName } from "./icons";
import { skodaView } from "./skoda-view";
import { SkodaClimate } from "./skoda-climate";
import { SonosRooms } from "./sonos-rooms";
import { AegControls } from "./aeg-controls";
import { SpotifyControls } from "./spotify-controls";

type S<T> = CardState<unknown> | undefined;
const as = <T,>(s: S<T>) => s as CardState<T> | undefined;
type P = { state: CardState<unknown> | undefined; now: Date };

const CHECK_ICON: Record<string, IconName> = { Lås: "lock", Dörrar: "door", Fönster: "window", Bagage: "trunk", Motorhuv: "car" };

export const SkodaCard = ({ state, now }: P) => (
  <CardShell<SkodaData> title="Škoda" icon="car" state={as(state)} now={now} className="skoda" render={(d) => {
    const v = skodaView(d, now);
    return {
      pill: v.pill,
      body: <>
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
        <SkodaClimate on={v.climate.on} targetC={v.climate.targetC} text={v.climate.text} />
        <div className="skoda-place">
          <Icon name="pin" />
          <span><span className="addr" title={v.placeFull ?? undefined}>{v.place}</span>{v.reported && <small>{v.reported}</small>}</span>
        </div>
      </>,
    };
  }} />
);

export const SonosCard = ({ state, now }: P) => (
  <CardShell<SonosData> title="Sonos" icon="spk" state={as(state)} now={now} className="sonos" render={(d) => {
    const playing = d.groups.filter((g) => g.playing).length;
    return {
      pill: playing > 0 ? { text: `Spelar i ${playing} rum`, tone: "ok" } : { text: "Tyst" },
      body: <SonosRooms groups={d.groups} />,
    };
  }} />
);

export const SpotifyCard = ({ state, now }: P) => (
  <CardShell<SpotifyData> title="Spotify" icon="note" state={as(state)} now={now} render={(d) => ({
    pill: { text: d.playing ? "Spelar" : "Pausad", tone: d.playing ? "ok" : undefined },
    // Enhet visas i "Byt enhet" och läget i pillret, så de står inte en gång till. När inget spelar visas när låten senast spelades.
    body: <><div className="big text">{d.title}</div>{(d.artist || (!d.playing && d.lastPlayedAt)) && <div className="mid">{[d.artist, !d.playing && d.lastPlayedAt ? `senast ${formatClock(d.lastPlayedAt)}` : null].filter(Boolean).join(" · ")}</div>}<SpotifyControls playing={d.playing} device={d.device} deviceRestricted={d.deviceRestricted} supportsVolume={d.supportsVolume} volume={d.volume} /></>,
  })} />
);

export const AegCard = ({ state, now }: P) => (
  <CardShell<AegData> title="AEG" icon="wash" state={as(state)} now={now} render={(d) => {
    const active = d.state === "RUNNING" || d.state === "PAUSED" || d.state === "DELAYED_START";
    return {
      // Stor text visar läget; pillret visar uppkoppling, eller läget när maskinen kör (då är stora texten tiden kvar).
      pill: !d.connected ? { text: "Offline", tone: "bad" } : active ? { text: d.stateText, tone: "warn" } : { text: "Online", tone: "ok" },
      body: <>
        {active && d.minutesLeft !== null
          ? <div className="big">{formatMinutes(d.minutesLeft)}<small>kvar</small></div>
          : <div className="big text">{d.stateText}</div>}
        <div className="mid">{d.appliance}{d.program && <> · <strong>{d.program}</strong></>}{d.phase && active && ` · ${d.phase}`}{d.doneAt && ` · klar ca ${formatClock(d.doneAt)}`}</div>
        {d.connected && <AegControls state={d.state} remoteControl={d.remoteControl} />}
      </>,
    };
  }} />
);

/** Arlo stöds inte (inget öppet API; inofficiell inloggning blockeras av Arlos Cloudflare-skydd). Ingen påhittad data visas. */
export const ArloUnsupportedCard = () => (
  <section className="card off unsupported" aria-label="Arlo">
    <div className="card-head"><Icon name="cam" /><span className="name">Arlo</span><span className="pill">Stöds inte</span></div>
    <p className="mid">Arlo har inget öppet gränssnitt, och den inofficiella vägen blockeras av Arlo. Använd Arlo-appen för kamerorna.</p>
  </section>
);

export const WeatherCard = ({ state, now }: P) => (
  <CardShell<WeatherData> title="Väder" icon="cloud" state={as(state)} now={now} render={(d) => ({
    pill: d.aqiLabel ? { text: `Luft: ${d.aqiLabel}`, tone: d.aqi !== null && d.aqi <= 40 ? "ok" : d.aqi !== null && d.aqi <= 60 ? undefined : "warn" } : undefined,
    body: <>
      <div className="big">{formatTemp(d.tempC)}<small>°C</small></div>
      <div className="mid"><strong>{d.place}</strong> · {d.text}{d.windMs !== null && ` · vind ${Math.round(d.windMs)} m/s`}</div>
      <div className="rows"><div className="row"><span>Luftkvalitet</span><span>{d.aqi !== null ? `${d.aqi} · ${d.aqiLabel}` : "–"}</span></div></div>
    </>,
  })} />
);

export const TadoCard = ({ state, now }: P) => (
  <CardShell<TadoData> title="Inomhus" icon="temp" state={as(state)} now={now} render={(d) => {
    const heating = d.rooms.filter((r) => r.heating).length;
    return {
      pill: heating > 0 ? { text: `Värmer i ${heating} rum`, tone: "warn" } : { text: "Vilar" },
      body: <div className="rows compact">{d.rooms.length === 0 ? <p className="mid">Inga rum hittades i Tado.</p> : d.rooms.map((r) => (
        <div className="row" key={r.name}>
          <span>{r.heating && <span className="dot" aria-label="värmer" />}{r.name}</span>
          <span>{r.tempC !== null ? `${formatTempShort(r.tempC)}°` : "–"}</span>
        </div>
      ))}</div>,
    };
  }} />
);
