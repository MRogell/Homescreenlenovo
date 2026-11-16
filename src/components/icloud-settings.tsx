"use client";
import { useState } from "react";

/** iCloud-kalender via CalDAV. Kräver ett appspecifikt lösenord (skapas på appleid.apple.com). Lösenordet sparas krypterat och visas aldrig igen. */
export function IcloudSettings({ connected }: { connected: boolean }) {
  const [on, setOn] = useState(connected);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function call(method: "POST" | "DELETE", body?: object) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/icloud", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = (await res.json().catch(() => null)) as { error?: string; calendars?: string[] } | null;
      if (!res.ok) throw new Error(j?.error ?? "Det gick inte att spara.");
      if (method === "POST") { setOn(true); setPassword(""); setMsg({ text: `iCloud är kopplad (${(j?.calendars ?? []).join(", ")}).`, bad: false }); }
      else { setOn(false); setMsg({ text: "iCloud är bortkopplad.", bad: false }); }
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen kontakt med servern.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="iCloud-kalender">
      <div className="card-head"><span className="name">iCloud-kalender (iPhone)</span></div>
      <p className="mid">Visar och lägger till aktiviteter i iCloud-kalendrar. Skapa ett <b>appspecifikt lösenord</b> på appleid.apple.com → Logga in och säkerhet → Applösenord. Ditt vanliga lösenord fungerar inte.</p>
      {on ? (
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}><span>Ansluten</span><button type="button" className="sm-btn" disabled={busy} onClick={() => void call("DELETE")}>Koppla från</button></div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void call("POST", { user: user.trim(), password: password.trim() }); }}>
          <label className="dn-label" htmlFor="ic-u">Apple-ID (e-post)</label>
          <input id="ic-u" className="ca-field" type="email" autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} required />
          <label className="dn-label" htmlFor="ic-p">Appspecifikt lösenord</label>
          <input id="ic-p" className="ca-field" type="password" autoComplete="off" placeholder="xxxx-xxxx-xxxx-xxxx" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="sm-btn primary" disabled={busy || !user.trim() || password.trim().length < 8}>{busy ? "Prövar…" : "Koppla iCloud"}</button>
        </form>
      )}
      {msg && <p className={msg.bad ? "err" : "mid"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
    </section>
  );
}
