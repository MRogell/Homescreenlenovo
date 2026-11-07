import { formatClock, formatMinutes, formatTemp } from "@/lib/format";
import type { CardState } from "@/server/providers/types";
import type { AegData, ArloData, PlejdData, SkodaData, SonosData, SpotifyData, TadoData } from "@/server/providers/schemas";
import { CardShell } from "./card-shell";

type S<T> = CardState<unknown> | undefined;
const as = <T,>(s: S<T>) => s as CardState<T> | undefined;
type P = { state: CardState<unknown> | undefined; now: Date };

export const SkodaCard = ({ state, now }: P) => (
  <CardShell<SkodaData> title="Škoda" icon="car" state={as(state)} now={now} render={(d) => ({
    pill: { text: d.locked ? "Låst" : "Olåst", tone: d.locked ? "ok" : "warn" },
    body: <><div className="big">{d.rangeKm}<small>km</small></div><div className="bar"><i style={{ width: `${d.batteryPct}%` }} /></div><div className="mid"><strong>{d.batteryPct} %</strong> batteri · parkerad {d.parked}</div></>,
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
    body: <><div className="big text">{d.title}</div>{d.artist && <div className="mid">{d.artist}</div>}<div className="rows"><div className="row"><span>Enhet</span><span>{d.device ?? "–"}</span></div><div className="row"><span>{d.playing ? "Status" : "Senast spelat"}</span><span>{d.playing ? "Spelar nu" : d.lastPlayedAt ? formatClock(d.lastPlayedAt) : "–"}</span></div></div></>,
  })} />
);

export const PlejdCard = ({ state, now }: P) => (
  <CardShell<PlejdData> title="Plejd" icon="bulb" state={as(state)} now={now} render={(d) => ({
    pill: { text: `${d.on} tända`, tone: d.on > 0 ? "warn" : undefined },
    body: <><div className="big">{d.on}<small>av {d.total} lampor</small></div><div className="rows">{d.rooms.map((r) => <div className="row" key={r.name}><span>{r.name}</span><span>{r.on}</span></div>)}</div></>,
  })} />
);

export const TadoCard = ({ state, now }: P) => (
  <CardShell<TadoData> title="Tado" icon="temp" state={as(state)} now={now} render={(d) => {
    const [first, ...rest] = d.rooms;
    return {
      pill: { text: d.heating ? "Värmer" : "Vilar", tone: d.heating ? "ok" : undefined },
      body: <><div className="big">{first ? formatTemp(first.tempC) : "–"}<small>°C</small></div>{first && <div className="mid">{first.name} · mål <strong>{formatTemp(first.targetC)}°</strong></div>}<div className="rows">{rest.map((r) => <div className="row" key={r.name}><span>{r.name}</span><span>{formatTemp(r.tempC)}°</span></div>)}</div></>,
    };
  }} />
);

export const TapoCard = ({ state, now }: P) => (
  <CardShell<{ plugsOn: number; plugsTotal: number; camerasOnline: number; camerasTotal: number }> title="Tapo" icon="plug" state={as(state)} now={now} render={(d) => ({
    pill: { text: `${d.camerasOnline}/${d.camerasTotal} kameror`, tone: "ok" },
    body: <><div className="big">{d.plugsOn}<small>av {d.plugsTotal} uttag på</small></div></>,
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
