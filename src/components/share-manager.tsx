"use client";
import { Check, Copy, Share2, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { formatAgo } from "@/lib/format";

export interface ShareRow { id: string; name: string; url: string; createdAt: number; lastUsedAt: number | null }
type ApiShare = { id: string; name: string; token: string; createdAt: number; lastUsedAt: number | null };

const COLORS = ["blue", "green", "yellow", "red", "purple"] as const;
const colorOf = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]!;

/**
 * Familjemedlemmar som delar inköpslistan och lapparna: en egen länk per person, som kan skickas, kopieras och tas bort.
 * `initial` null = hämta från servern när den visas (används i handlaläget, vars sida inte får innehålla några länkar).
 */
export function ShareManager({ initial, origin }: { initial: ShareRow[] | null; origin?: string }) {
  const [rows, setRows] = useState<ShareRow[] | null>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const toRows = (list: ApiShare[]): ShareRow[] => list.map((s) => ({ id: s.id, name: s.name, url: `${base}/familj/${s.token}`, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt }));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator.share === "function");
    if (initial !== null) return;
    let alive = true;
    fetch("/api/share", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { shares?: ApiShare[] }) => { if (alive) setRows(toRows(j.shares ?? [])); })
      .catch(() => { if (alive) { setRows([]); setMsg({ text: "Kunde inte hämta personerna. Det behövs nät.", bad: true }); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setMsg({ text: "Det gick inte att kopiera. Använd Skicka i stället.", bad: true });
    }
  }
  const send = (r: ShareRow) => void navigator.share({ title: "Familjens inköpslista", text: `Hej ${r.name}! Här är familjens inköpslista och lappar:`, url: r.url }).catch(() => {});
  const now = new Date();

  if (rows === null) return <p className="mid">Hämtar…</p>;

  return (
    <div className="sm">
      {rows.length === 0 ? <p className="mid">Ingen har fått en länk än. Lägg till en person nedan.</p> : (
        <ul className="sm-list">
          {rows.map((r) => (
            <li key={r.id} className="sm-row">
              <span className={`sm-avatar c-${colorOf(r.name)}`} aria-hidden="true">{r.name.slice(0, 1).toUpperCase()}</span>
              <span className="sm-who"><b>{r.name}</b><small>{r.lastUsedAt ? `Senast ${formatAgo(new Date(r.lastUsedAt).toISOString(), now)}` : "Har inte öppnat länken än"}</small></span>
              {confirm === r.id ? (
                <span className="sm-confirm" role="group" aria-label={`Ta bort ${r.name}?`}>
                  <button type="button" className="sm-btn danger" disabled={busy} onClick={() => void call("DELETE", { id: r.id }, `${r.name} har inte längre tillgång.`).then(() => setConfirm(null))}>Ta bort</button>
                  <button type="button" className="sm-btn" onClick={() => setConfirm(null)}>Avbryt</button>
                </span>
              ) : (
                <span className="sm-actions">
                  {canShare
                    ? <button type="button" className="sm-btn primary" disabled={busy} onClick={() => send(r)} aria-label={`Skicka länk till ${r.name}`}><Share2 aria-hidden="true" />Skicka</button>
                    : <button type="button" className="sm-btn primary" disabled={busy} onClick={() => void copy(r)} aria-label={`Kopiera länk för ${r.name}`}>{copied === r.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied === r.id ? "Kopierad" : "Kopiera länk"}</button>}
                  {canShare && <button type="button" className="sm-icon" disabled={busy} onClick={() => void copy(r)} aria-label={`Kopiera länk för ${r.name}`} title="Kopiera länk">{copied === r.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>}
                  <button type="button" className="sm-icon" disabled={busy} onClick={() => setConfirm(r.id)} aria-label={`Ta bort ${r.name}`} title="Ta bort"><Trash2 aria-hidden="true" /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="sm-form" onSubmit={async (e) => { e.preventDefault(); if (await call("POST", { name: name.trim() }, "Länken är skapad. Skicka den till personen.")) setName(""); }}>
        <label className="sr-only" htmlFor="sm-name">Namn på person</label>
        <input id="sm-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required placeholder="Lägg till person, till exempel Anna" autoComplete="off" />
        <button type="submit" className="sm-btn primary" disabled={busy || !name.trim()}><UserPlus aria-hidden="true" />Lägg till</button>
      </form>
      <p className={msg?.bad ? "err small" : "mid small"} role={msg?.bad ? "alert" : "status"}>{msg?.text ?? " "}</p>
    </div>
  );
}
