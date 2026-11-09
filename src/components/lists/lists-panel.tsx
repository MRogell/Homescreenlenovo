"use client";
import { ArrowUpRight, Check, ClipboardCopy, Plus, Trash2, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { doneItems, groupItems, type ShopItem } from "@/lib/shopping";
import { formatAgo } from "@/lib/format";
import { useLists } from "./use-lists";

export type ListsApi = ReturnType<typeof useLists>;
export { useLists };

/** Listan som text att skicka eller klistra in (grupperad som i butiken). */
export function listAsText(items: readonly ShopItem[]): string {
  const lines = groupItems(items).flatMap((g) => [`${g.label}:`, ...g.items.map((i) => `• ${i.name}${i.qty ? ` (${i.qty})` : ""}`), ""]);
  return lines.join("\n").trim();
}

function Row({ item, big, onToggle, onRemove }: { item: ShopItem; big: boolean; onToggle: (c: boolean) => void; onRemove: () => void }) {
  return (
    <li className={`li-item${item.checked ? " done" : ""}${big ? " big" : ""}`}>
      <label className="li-row">
        <input type="checkbox" checked={item.checked} onChange={(e) => onToggle(e.target.checked)} />
        <span className="li-box" aria-hidden="true"><Check /></span>
        <span className="li-name">{item.name}</span>
        {item.qty && <span className="li-qty">{item.qty}</span>}
      </label>
      <button type="button" className="li-x" aria-label={`Ta bort ${item.name}`} onClick={onRemove}><X aria-hidden="true" /></button>
    </li>
  );
}

function AddBar({ api, big }: { api: ListsApi; big: boolean }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const [msg, setMsg] = useState("");
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const typedLast = text.split(/[,;\n]/).at(-1) ?? "";
  const hints = useMemo(() => (focus && typedLast.trim() ? api.complete(typedLast) : []), [api, focus, typedLast]);

  function submit(value = text) {
    const r = api.add(value);
    setText("");
    setMsg(r.existing.length ? `${r.existing.join(", ")} finns redan på listan.` : "");
    ref.current?.focus();
  }
  function pick(name: string) {
    const parts = text.split(/([,;\n])/);
    parts[parts.length - 1] = name;
    submit(parts.join(""));
  }

  return (
    <div className="li-add">
      <form className={`li-form${big ? " big" : ""}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor={id} className="sr-only">Lägg till vara</label>
        <input id={id} ref={ref} value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} placeholder="Lägg till vara…" enterKeyHint="done" autoComplete="off" autoCapitalize="sentences" maxLength={200} />
        <button type="submit" className="li-plus" aria-label="Lägg till" disabled={!text.trim()}><Plus aria-hidden="true" /></button>
      </form>
      {hints.length > 0 && (
        <ul className="li-hints" aria-label="Förslag">
          {hints.map((h) => <li key={h}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>{h}</button></li>)}
        </ul>
      )}
      <p className="li-msg" role="status">{msg}</p>
    </div>
  );
}

function Chips({ api, limit }: { api: ListsApi; limit: number }) {
  const list = api.suggest(limit);
  if (list.length === 0) return null;
  return (
    <div className="li-chips" aria-label="Vanliga varor">
      {list.map((n) => <button key={n} type="button" className="li-chip" onClick={() => api.add(n)}><Plus aria-hidden="true" />{n}</button>)}
    </div>
  );
}

function Notes({ api }: { api: ListsApi }) {
  const [text, setText] = useState("");
  const id = useId();
  const now = new Date();
  return (
    <div className="li-notes">
      <form className="li-form" onSubmit={(e) => { e.preventDefault(); api.noteAdd(text); setText(""); }}>
        <label htmlFor={id} className="sr-only">Ny lapp</label>
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv en lapp till familjen" enterKeyHint="done" autoComplete="off" maxLength={280} />
        <button type="submit" className="li-plus" aria-label="Lägg till lapp" disabled={!text.trim()}><Plus aria-hidden="true" /></button>
      </form>
      {api.state.notes.length === 0 ? <p className="mid small">Inga lappar. Skriv en så ser alla den.</p> : (
        <ul className="li-notelist">
          {api.state.notes.map((n) => (
            <li key={n.id}>
              <span className="li-notetext">{n.text}<small>{formatAgo(new Date(n.at).toISOString(), now)}</small></span>
              <button type="button" className="li-x" aria-label="Ta bort lappen" onClick={() => api.noteRemove(n.id)}><X aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CARD_MAX = 5;

/** Inköpslistan. `card` är den kompakta på hemskärmen; `full` är handlaläget: stora rader, förlopp och offline. */
export function ListsPanel({ api, mode }: { api: ListsApi; mode: "card" | "full" }) {
  const big = mode === "full";
  const { state } = api;
  const [tab, setTab] = useState<"shop" | "notes">("shop");
  const [showDone, setShowDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const groups = useMemo(() => groupItems(state.items), [state.items]);
  const done = useMemo(() => doneItems(state.items), [state.items]);
  const open = state.items.length - done.length;

  // Håll skärmen tänd medan man handlar.
  useEffect(() => {
    if (!big || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = () => { if (document.visibilityState === "visible") navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    get();
    document.addEventListener("visibilitychange", get);
    return () => { document.removeEventListener("visibilitychange", get); void lock?.release().catch(() => {}); };
  }, [big]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(listAsText(state.items.filter((i) => !i.checked)));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Webbläsaren får inte kopiera: knappen gör ingenting, listan går att markera ändå.
    }
  }

  // Kort: högst några rader, resten räknas.
  const { cardGroups, shown } = useMemo(() => {
    let n = 0;
    const out: typeof groups = [];
    for (const g of groups) {
      const take = big ? g.items : g.items.slice(0, Math.max(0, CARD_MAX - n));
      n += take.length;
      if (take.length > 0) out.push({ ...g, items: take });
    }
    return { cardGroups: out, shown: n };
  }, [groups, big]);
  const hidden = open - shown;

  if (!api.loaded) return <p className="mid">Hämtar listan…</p>;

  return (
    <div className={`li${big ? " li-full" : ""}`}>
      {!api.online && (
        <p className="li-offline" role="status"><WifiOff aria-hidden="true" />Ingen täckning. Ändringar sparas i telefonen och skickas när nätet är tillbaka{api.pendingCount > 0 ? ` (${api.pendingCount} väntar)` : ""}.</p>
      )}
      {api.error && <p className="err" role="alert">{api.error}</p>}

      {!big && (
        <div className="li-top">
          <div className="li-tabs" role="tablist" aria-label="Lista eller lappar">
            <button role="tab" type="button" aria-selected={tab === "shop"} onClick={() => setTab("shop")}>Inköp{open > 0 ? <b>{open}</b> : null}</button>
            <button role="tab" type="button" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>Lappar{state.notes.length > 0 ? <b>{state.notes.length}</b> : null}</button>
          </div>
          <Link className="li-expand" href="/handla" aria-label="Öppna handlaläget (stor vy för butiken)"><ArrowUpRight aria-hidden="true" /></Link>
        </div>
      )}

      {big && state.items.length > 0 && (
        <div className="li-progress" aria-label={`${done.length} av ${state.items.length} i korgen`}>
          <div className="li-bar"><i style={{ width: `${Math.round((done.length / state.items.length) * 100)}%` }} /></div>
          <span>{done.length} av {state.items.length} i korgen</span>
        </div>
      )}

      {(big || tab === "shop") ? (
        <>
          <AddBar api={api} big={big} />
          {open === 0 && done.length === 0 && <Chips api={api} limit={big ? 10 : 6} />}
          {open === 0 && done.length === 0 && <p className="mid small">Listan är tom. Skriv en vara, eller välj en av de vanliga.</p>}
          {cardGroups.map((g) => (
            <section key={g.id} className="li-group" aria-label={g.label}>
              <h3 className="li-cat">{g.label}</h3>
              <ul className="li-list">
                {g.items.map((i) => <Row key={i.id} item={i} big={big} onToggle={(c) => api.toggle(i.id, c)} onRemove={() => api.remove(i.id)} />)}
              </ul>
            </section>
          ))}
          {!big && hidden > 0 && <Link className="li-more" href="/handla">+{hidden} till · öppna Handla</Link>}
          {open > 0 && big && <Chips api={api} limit={8} />}
          {done.length > 0 && (
            <section className="li-group li-done" aria-label="Avbockade">
              <div className="li-donehead">
                <button type="button" className="li-toggle" aria-expanded={big || showDone} onClick={() => setShowDone((v) => !v)} disabled={big}>
                  {big ? "I korgen" : showDone ? "Dölj avbockade" : "Avbockade"} <b>{done.length}</b>
                </button>
                <button type="button" className="li-clear" onClick={api.clearChecked}><Trash2 aria-hidden="true" />Rensa</button>
              </div>
              {(big || showDone) && <ul className="li-list">{done.map((i) => <Row key={i.id} item={i} big={big} onToggle={(c) => api.toggle(i.id, c)} onRemove={() => api.remove(i.id)} />)}</ul>}
            </section>
          )}
          {big && open > 0 && (
            <button type="button" className="li-copy" onClick={() => void copy()}><ClipboardCopy aria-hidden="true" />{copied ? "Kopierad" : "Kopiera listan som text"}</button>
          )}
        </>
      ) : <Notes api={api} />}
    </div>
  );
}
