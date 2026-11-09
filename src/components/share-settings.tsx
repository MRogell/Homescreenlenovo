"use client";
import { Check, Copy, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatAgo } from "@/lib/format";

export interface ShareRow { id: string; name: string; url: string; createdAt: number; lastUsedAt: number | null }
type ApiShare = { id: string; name: string; token: string; createdAt: number; lastUsedAt: number | null };

/** Familjemedlemmar som delar inköpslistan och lapparna, var och en med en egen länk som kan tas bort. */
export function ShareSettings({ initial, origin }: { initial: ShareRow[]; origin: string }) {
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const now = new Date();

  const toRows = (list: ApiShare[]): ShareRow[] => list.map((s) => ({ id: s.id, name: s.name, url: `${origin}/familj/${s.token}`, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt }));

  async function call(method: "POST" | "DELETE", body: object, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/share", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { shares?: ApiShare[]; error?: string } | null;
      if (!res.ok || !j?.shares) throw new Error(j?.error ?? "Det gick inte att spara.");
      setRows(toRows(j.shares));
      setMsg({ text: ok, bad: false });
      return true;
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen kontakt med servern.", bad: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function copy(r: ShareRow) {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopied(r.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMsg({ text: "Det gick inte att kopiera. Håll in länken och kopiera den själv.", bad: true });
    }
  }
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = (r: ShareRow) => void navigator.share({ title: "Familjens inköpslista", text: `Hej ${r.name}! Här är familjens inköpslista och lappar:`, url: r.url }).catch(() => {});

  return (
    <section className="card sharesettings" aria-label="Familjen">
      <div className="card-head"><span className="name">Familjen</span></div>
      <p className="mid small">Dela inköpslistan och lapparna. Varje person får en egen länk som bara öppnar de två: inga bilkommandon, ingen musik, inga inställningar. Skicka länken, så kan hen lägga in och bocka av direkt, och det hen skriver märks med hens namn.</p>
      {rows.length === 0 ? <p className="mid">Ingen har fått en länk än.</p> : (
        <ul className="sh-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="sh-name">{r.name}<small className="mid">{r.lastUsedAt ? `använde länken ${formatAgo(new Date(r.lastUsedAt).toISOString(), now)}` : "har inte öppnat länken än"}</small></span>
              <span className="sh-actions">
                {canShare && <button type="button" className="btn secondary" disabled={busy} onClick={() => share(r)} aria-label={`Skicka länk till ${r.name}`}><Share2 aria-hidden="true" />Skicka</button>}
                <button type="button" className="btn secondary" disabled={busy} onClick={() => void copy(r)} aria-label={`Kopiera länk för ${r.name}`}>{copied === r.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied === r.id ? "Kopierad" : "Kopiera"}</button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => void call("DELETE", { id: r.id }, `${r.name} har inte längre tillgång.`)} aria-label={`Ta bort ${r.name}`}><Trash2 aria-hidden="true" />Ta bort</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="sh-form" onSubmit={async (e) => { e.preventDefault(); if (await call("POST", { name: name.trim() }, "Länken är skapad.")) setName(""); }}>
        <label>Namn<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required placeholder="Till exempel Anna" /></label>
        <button type="submit" className="btn" disabled={busy || !name.trim()}>Skapa länk</button>
      </form>
      <p className="mid small">Den som har länken kan läsa och ändra listan och lapparna. Tas länken bort slutar den fungera direkt.</p>
      <p className={msg?.bad ? "err" : "mid"} role={msg?.bad ? "alert" : "status"}>{msg?.text ?? " "}</p>
    </section>
  );
}
