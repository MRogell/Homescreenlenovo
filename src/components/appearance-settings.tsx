"use client";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useRef, useState } from "react";
import { moveCard, type AppSettings, type CardId, type SettingsPatch } from "@/lib/settings";

const LABELS: Record<CardId, string> = { weather: "Väder", calendar: "Kalender", skoda: "Škoda", spotify: "Spotify", sonos: "Sonos", aeg: "AEG", tado: "Inomhus" };
type Hit = { name: string; region: string; lat: number; lon: number };

/** Utseende: kortens ordning och synlighet, väderplats och nattläge. Varje ändring sparas direkt och återställs om sparandet misslyckas. */
export function AppearanceSettings({ initial, defaultPlace }: { initial: AppSettings; defaultPlace: string }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const seq = useRef(0);

  async function save(patch: SettingsPatch, optimistic?: AppSettings) {
    const before = s;
    if (optimistic) setS(optimistic);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = (await res.json().catch(() => null)) as { settings?: AppSettings; error?: string } | null;
      if (!res.ok || !j?.settings) throw new Error(j?.error ?? "Det gick inte att spara.");
      setS(j.settings);
      setMsg({ text: "Sparat", bad: false });
    } catch (e) {
      setS(before);
      setMsg({ text: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen kontakt med servern. Ändringen sparades inte.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  const cards = (order: CardId[], hidden: CardId[]): AppSettings => ({ ...s, cards: { order, hidden } });
  const move = (id: CardId, delta: -1 | 1) => { const order = moveCard(s.cards.order, id, delta); void save({ cards: { order, hidden: s.cards.hidden } }, cards(order, s.cards.hidden)); };
  const toggle = (id: CardId, show: boolean) => {
    const hidden = show ? s.cards.hidden.filter((h) => h !== id) : [...s.cards.hidden, id];
    void save({ cards: { order: s.cards.order, hidden } }, cards(s.cards.order, hidden));
  };
  const night = (n: Partial<AppSettings["night"]>) => { const next = { ...s.night, ...n }; void save({ night: next }, { ...s, night: next }); };

  async function search() {
    const q = query.trim();
    if (q.length < 2) return setSearchError("Skriv minst två tecken.");
    const mine = ++seq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/settings/place-search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { places?: Hit[]; error?: string } | null;
      if (mine !== seq.current) return; // ett nyare sök har tagit över
      if (!res.ok || !j?.places) throw new Error(j?.error ?? "Sökningen misslyckades.");
      setHits(j.places);
      if (j.places.length === 0) setSearchError("Hittade ingen ort med det namnet.");
    } catch (e) {
      if (mine === seq.current) { setHits(null); setSearchError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen kontakt med servern."); }
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }

  const choose = (h: Hit) => { setHits(null); setQuery(""); void save({ place: { name: h.name, lat: h.lat, lon: h.lon } }, { ...s, place: { name: h.name, lat: h.lat, lon: h.lon } }); };

  return (
    <section className="card appearance" aria-label="Utseende">
      <div className="card-head"><span className="name">Utseende</span></div>

      <h2 className="ap-h">Kort</h2>
      <ul className="ap-cards">
        {s.cards.order.map((id, i) => (
          <li key={id}>
            <label className="ap-show">
              <input type="checkbox" role="switch" checked={!s.cards.hidden.includes(id)} disabled={busy} onChange={(e) => toggle(id, e.target.checked)} />
              <span>{LABELS[id]}</span>
            </label>
            <button type="button" className="ap-move" aria-label={`Flytta ${LABELS[id]} upp`} disabled={busy || i === 0} onClick={() => move(id, -1)}><ArrowUp aria-hidden="true" /></button>
            <button type="button" className="ap-move" aria-label={`Flytta ${LABELS[id]} ner`} disabled={busy || i === s.cards.order.length - 1} onClick={() => move(id, 1)}><ArrowDown aria-hidden="true" /></button>
          </li>
        ))}
      </ul>

      <h2 className="ap-h">Väderplats</h2>
      <p className="mid">{s.place ? s.place.name : `${defaultPlace} (standard)`}</p>
      <form className="ap-search" onSubmit={(e) => { e.preventDefault(); void search(); }} role="search">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sök ort, till exempel Umeå" aria-label="Sök ort" maxLength={60} enterKeyHint="search" />
        <button type="submit" className="btn" disabled={searching || busy}><Search aria-hidden="true" />Sök</button>
      </form>
      {searchError && <p className="err" role="alert">{searchError}</p>}
      {hits && hits.length > 0 && (
        <ul className="ap-hits" aria-label="Träffar">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon}`}><button type="button" className="device" disabled={busy} onClick={() => choose(h)}>{h.name}<span>{h.region}</span></button></li>
          ))}
        </ul>
      )}
      {s.place && <button type="button" className="btn secondary ap-inline" disabled={busy} onClick={() => void save({ place: null }, { ...s, place: null })}>Använd standardorten ({defaultPlace})</button>}

      <h2 className="ap-h">Nattläge</h2>
      <label className="ap-show">
        <input type="checkbox" role="switch" checked={s.night.enabled} disabled={busy} onChange={(e) => night({ enabled: e.target.checked })} />
        <span>Dämpa skärmen på natten</span>
      </label>
      <div className="ap-times">
        <label>Från<input type="time" value={s.night.from} disabled={busy || !s.night.enabled} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && night({ from: e.target.value })} /></label>
        <label>Till<input type="time" value={s.night.to} disabled={busy || !s.night.enabled} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && night({ to: e.target.value })} /></label>
      </div>
      <p className="mid small">Skärmen görs mörkare i bilden. Plattans eller telefonens riktiga ljusstyrka kan inte appen ändra.</p>

      <div className="ap-foot">
        <button type="button" className="btn secondary" disabled={busy} onClick={() => void save({ reset: true })}>Återställ allt</button>
        <span className={msg?.bad ? "err" : "mid"} role={msg?.bad ? "alert" : "status"}>{msg?.text ?? " "}</span>
      </div>
    </section>
  );
}
