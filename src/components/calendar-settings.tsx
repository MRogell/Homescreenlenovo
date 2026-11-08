"use client";
import { useState } from "react";
import type { CalendarColor, PublicCalendar } from "@/server/calendar/store";

const COLORS: { id: CalendarColor; label: string }[] = [
  { id: "blue", label: "Blå" }, { id: "green", label: "Grön" }, { id: "yellow", label: "Gul" }, { id: "red", label: "Röd" }, { id: "purple", label: "Lila" },
];
const MAX = 6;

/** Kalendrar via hemlig iCal-adress. Adressen skickas till servern och visas aldrig igen (bara värdnamnet). */
export function CalendarSettings({ initial }: { initial: PublicCalendar[] }) {
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [color, setColor] = useState<CalendarColor>("blue");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function call(method: "POST" | "DELETE", body: object, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/calendars", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { calendars?: PublicCalendar[]; error?: string } | null;
      if (!res.ok || !j?.calendars) throw new Error(j?.error ?? "Det gick inte att spara.");
      setList(j.calendars);
      setMsg({ text: ok, bad: false });
      return true;
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen kontakt med servern.", bad: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", { name: name.trim(), color, url: url.trim() }, "Kalendern är tillagd.")) { setName(""); setUrl(""); }
  }

  return (
    <section className="card calsettings" aria-label="Kalender">
      <div className="card-head"><span className="name">Kalender</span></div>
      {list.length === 0 ? <p className="mid">Ingen kalender ansluten.</p> : (
        <ul className="cs-list">
          {list.map((c) => (
            <li key={c.id}>
              <span className={`cs-dot c-${c.color}`} aria-hidden="true" />
              <span className="cs-name">{c.name}<small className="mid">{c.host}</small></span>
              <button type="button" className="btn secondary cs-del" disabled={busy} aria-label={`Ta bort ${c.name}`} onClick={() => void call("DELETE", { id: c.id }, "Kalendern är borttagen.")}>Ta bort</button>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX ? (
        <form className="cs-form" onSubmit={add}>
          <h2 className="ap-h">Lägg till kalender</h2>
          <label>Namn<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="Till exempel Familjen" /></label>
          <fieldset className="cs-colors">
            <legend>Färg</legend>
            {COLORS.map((c) => (
              <label key={c.id} className={`cs-color c-${c.id}`}>
                <input type="radio" name="cal-color" value={c.id} checked={color === c.id} onChange={() => setColor(c.id)} />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
          <label>Hemlig iCal-adress<input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://… eller webcal://…" /></label>
          <p className="mid small">I Google Kalender: Inställningar → din kalender → ”Hemlig adress i iCal-format”. Adressen sparas krypterad och visas aldrig igen.</p>
          <button type="submit" className="btn" disabled={busy || !name.trim() || !url.trim()}>{busy ? "Kontrollerar…" : "Lägg till"}</button>
        </form>
      ) : <p className="mid small">Högst {MAX} kalendrar. Ta bort en för att lägga till en ny.</p>}
      <p className={msg?.bad ? "err" : "mid"} role={msg?.bad ? "alert" : "status"}>{msg?.text ?? " "}</p>
    </section>
  );
}
