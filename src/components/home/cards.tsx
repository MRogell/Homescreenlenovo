import { formatClock, formatMinutes, formatTemp } from "@/lib/format";
import type { CardState } from "@/server/providers/types";
import type { AegData, ArloData, SkodaData, SonosData, SpotifyData, WeatherData } from "@/server/providers/schemas";
import { CardShell } from "./card-shell";
import { SpotifyControls } from "./spotify-controls";

type S<T> = CardState<unknown> | undefined;
const as = <T,>(s: S<T>) => s as CardState<T> | undefined;
type P = { state: CardState<unknown> | undefined; now: Date };

export const SkodaCard = ({ state, now }: P) => (
  <CardShell<SkodaData> title="Škoda" icon="car" state={as(state)} now={now} render={(d) => ({
    pill: d.locked === null ? { text: "Okänt läge" } : { text: d.locked ? "Låst" : "Olåst", tone: d.locked ? "ok" : "warn" },
    body: <>
      <div className="big">{d.rangeKm ?? "–"}<small>km</small></div>
      {d.levelPct !== null && <div className="bar"><i style={{ width: `${d.levelPct}%` }} /></div>}
      <div className="mid">
        {d.levelPct !== null && <><strong>{d.levelPct} %</strong> {d.levelKind === "battery" ? "batteri" : "tank"} · </>}
        {d.charging && "laddar · "}
        {d.parked ? `parkerad ${d.parked}` : "plats okänd"}
      </div>
    </>,
  })} />
);

export const SonosCard = ({ state, now }: P) => (
  <CardShell<SonosData> title="Sonos" icon="spk" state={as(state)} now={now} render={(d) => ({
    pill: { text: d.playing ? "Spelar" : "Pausad", tone: d.playing ? "ok" : undefined },
    body: <><div className="big text">{d.title}</div><div className="mid">{d.artist && `${d.artist} · `}<strong>{d.room}</strong>{d.grouped.length > 0 && ` + ${d.grouped.join(", ")}`}</div><div className="bar amber"><i style={{ width: `${d.progressPct}%` }} /></div><div className="rows"><div className="row"><span>Volym</span><span>{d.volume}</span></div></div></>,
  })} />
);

export const SpotifyCard = ({ state, now }: P) => (
  <CardShell<SpotifyData> title="Spotify" icon="note" state={as(state)} now={now} render={(d) => ({
    pill: { text: d.playing ? "Spelar" : "Pausad", tone: d.playing ? "ok" : undefined },
    body: <><div className="big text">{d.title}</div>{d.artist && <div className="mid">{d.artist}</div>}<div className="rows"><div className="row"><span>Enhet</span><span>{d.device ?? "–"}</span></div><div className="row"><span>{d.playing ? "Status" : "Senast spelat"}</span><span>{d.playing ? "Spelar nu" : d.lastPlayedAt ? formatClock(d.lastPlayedAt) : "–"}</span></div></div><SpotifyControls playing={d.playing} device={d.device} /></>,
  })} />
);

export const AegCard = ({ state, now }: P) => (
  <CardShell<AegData> title="AEG" icon="wash" state={as(state)} now={now} render={(d) => ({
    pill: { text: d.running ? "Pågår" : "Klar", tone: d.running ? "warn" : "ok" },
    body: <><div className="big">{d.running ? formatMinutes(d.minutesLeft) : "Klar"}<small>{d.running ? "kvar" : ""}</small></div><div className="bar amber"><i style={{ width: `${d.progressPct}%` }} /></div><div className="mid">{d.appliance} · <strong>{d.program}</strong>{d.running && ` · klar ca ${formatClock(d.doneAt)}`}</div></>,
  })} />
);

export const ArloCard = ({ state, now }: P) => (
  <CardShell<ArloData> title="Arlo" icon="cam" state={as(state)} now={now} render={(d) => ({
    pill: { text: "Online", tone: "ok" },
    body: <><div className="big">{d.cameras}<small>kameror</small></div><div className="rows"><div className="row"><span>Senaste rörelse</span><span>{formatClock(d.lastMotionAt)} {d.lastMotionPlace}</span></div></div></>,
  })} />
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
