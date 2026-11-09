"use client";
import { ArrowUpRight, Check, ClipboardCopy, PartyPopper, Plus, SearchX, Trash2, Undo2, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { doneItems, groupItems, skippedItems, type Note, type ShopItem } from "@/lib/shopping";
import { formatAgo } from "@/lib/format";
import { useCardHeight, useFitMode } from "./use-fit";
import { useLists } from "./use-lists";
import { DinnerTab } from "./dinner-tab";

export type ListsApi = ReturnType<typeof useLists>;
export { useLists };

/** `card`: liten på hemskärmen. `page`: hela listan med fält och lappar (hantera). `shop`: butiksläget, bara att bocka av. */
export type PanelMode = "card" | "page" | "shop";

/** Listan som text att skicka eller klistra in (grupperad som i butiken). */
export function listAsText(items: readonly ShopItem[]): string {
  const lines = groupItems(items).flatMap((g) => [`${g.label}:`, ...g.items.map((i) => `• ${i.name}${i.qty ? ` (${i.qty})` : ""}`), ""]);
  return lines.join("\n").trim();
}

function Row({ item, big, shop, onToggle, onRemove, onSkip }: { item: ShopItem; big: boolean; shop?: boolean; onToggle: (c: boolean) => void; onRemove?: () => void; onSkip?: () => void }) {
  return (
    <li className={`li-item${item.checked ? " done" : ""}${big ? " big" : ""}`}>
      <label className="li-row">
        <input type="checkbox" checked={item.checked} onChange={(e) => onToggle(e.target.checked)} />
        <span className="li-box" aria-hidden="true"><Check /></span>
        <span className="li-name">{item.name}{item.by && big && !shop && <small className="li-by">{item.by}</small>}</span>
        {item.qty && <span className="li-qty">{item.qty}</span>}
      </label>
      {onSkip && !item.checked && <button type="button" className="li-skip" aria-label={`Hittade inte ${item.name}`} title="Hittade inte" onClick={onSkip}><SearchX aria-hidden="true" /></button>}
      {onRemove && <button type="button" className="li-x" aria-label={`Ta bort ${item.name}`} onClick={onRemove}><X aria-hidden="true" /></button>}
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

const noteWho = (n: Note) => (n.by ? `${n.by} · ` : "");

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
              <span className="li-notetext">{n.text}<small>{noteWho(n)}{formatAgo(new Date(n.at).toISOString(), now)}</small></span>
              <button type="button" className="li-x" aria-label="Ta bort lappen" onClick={() => api.noteRemove(n.id)}><X aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CARD_MAX = 5;
/** I läget "allt på en skärm": kortets fasta höjd minus det som alltid tar plats (rubrik, flikar, fält), delat på en rad. */
const FIT_FIXED = 152;
const FIT_ROW = 41;

/** Butiksläget: en enda lista att bocka av, i butikens ordning (frukt först, hushåll sist), utan rubriker. */
function Shop({ api }: { api: ListsApi }) {
  const { state } = api;
  const [showDone, setShowDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = useMemo(() => groupItems(state.items, { withSkipped: false }).flatMap((g) => g.items), [state.items]);
  const skipped = useMemo(() => skippedItems(state.items), [state.items]);
  const done = useMemo(() => doneItems(state.items), [state.items]);
  const total = state.items.length;
  const left = total - done.length;

  const tap = (id: string, c: boolean) => { if (typeof navigator.vibrate === "function") navigator.vibrate(12); api.toggle(id, c); };

  async function copy() {
    try {
      await navigator.clipboard.writeText(listAsText(state.items.filter((i) => !i.checked)));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Webbläsaren får inte kopiera.
    }
  }

  if (total === 0) return <p className="mid">Listan är tom. Lägg till varor på hemskärmen eller i familjens lista.</p>;

  return (
    <>
      <div className="li-progress" aria-label={`${done.length} av ${total} i korgen`}>
        <div className="li-bar"><i style={{ width: `${Math.round((done.length / total) * 100)}%` }} /></div>
        <span>{left > 0 ? `${left} kvar · ${done.length} i korgen` : "Allt är hanterat"}</span>
      </div>

      {open.length === 0 && (
        <div className="li-finish" role="status">
          <PartyPopper aria-hidden="true" />
          <b>{skipped.length > 0 ? "Klart, förutom det du inte hittade" : "Klart! Allt ligger i korgen"}</b>
          {skipped.length > 0 && <span>{skipped.length} {skipped.length === 1 ? "vara ligger" : "varor ligger"} kvar på listan till nästa gång.</span>}
          {done.length > 0 && <button type="button" className="li-clear big" onClick={api.clearChecked}><Trash2 aria-hidden="true" />Töm korgen</button>}
        </div>
      )}

      {open.length > 0 && (
        <ul className="li-list li-flat">
          {open.map((i) => <Row key={i.id} item={i} big shop onToggle={(c) => tap(i.id, c)} onSkip={() => api.skip(i.id, true)} />)}
        </ul>
      )}

      {skipped.length > 0 && (
        <section className="li-aisle li-missing" aria-label="Hittade inte">
          <h3 className="li-cat">Hittade inte <b>{skipped.length}</b></h3>
          <ul className="li-list">
            {skipped.map((i) => (
              <li key={i.id} className="li-item big">
                <span className="li-row li-skippedrow"><span className="li-name">{i.name}</span>{i.qty && <span className="li-qty">{i.qty}</span>}</span>
                <button type="button" className="li-back" onClick={() => api.skip(i.id, false)}><Undo2 aria-hidden="true" />Lägg tillbaka</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && open.length > 0 && (
        <section className="li-group li-done" aria-label="I korgen">
          <div className="li-donehead">
            <button type="button" className="li-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>I korgen <b>{done.length}</b></button>
          </div>
          {showDone && <ul className="li-list">{done.map((i) => <Row key={i.id} item={i} big shop onToggle={(c) => tap(i.id, c)} />)}</ul>}
        </section>
      )}

      {left > 0 && <button type="button" className="li-copy" onClick={() => void copy()}><ClipboardCopy aria-hidden="true" />{copied ? "Kopierad" : "Kopiera det som är kvar som text"}</button>}
    </>
  );
}

/** Inköpslistan och lapparna. Se PanelMode för de tre lägena. */
export function ListsPanel({ api, mode, handlaHref = "/handla" }: { api: ListsApi; mode: PanelMode; handlaHref?: string }) {
  const compact = mode === "card";
  const shop = mode === "shop";
  const big = !compact;
  const { state } = api;
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useFitMode() && compact;
  const height = useCardHeight(rootRef, fit);
  const cardMax = fit && height > 0 ? Math.max(1, Math.min(CARD_MAX, Math.floor((height - FIT_FIXED) / FIT_ROW))) : CARD_MAX;
  const dinnerRows = fit && height > 0 ? Math.max(2, Math.min(7, Math.floor((height - 218) / 40))) : 4;
  const [tab, setTab] = useState<"shop" | "notes" | "dinner">("shop");
  const [showDone, setShowDone] = useState(false);
  const groups = useMemo(() => groupItems(state.items), [state.items]);
  const done = useMemo(() => doneItems(state.items), [state.items]);
  const open = state.items.length - done.length;

  // Håll skärmen tänd medan man handlar.
  useEffect(() => {
    if (!shop || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = () => { if (document.visibilityState === "visible") navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    get();
    document.addEventListener("visibilitychange", get);
    return () => { document.removeEventListener("visibilitychange", get); void lock?.release().catch(() => {}); };
  }, [shop]);

  // Kort: högst några rader, resten räknas.
  const { cardGroups, shown } = useMemo(() => {
    let n = 0;
    const out: typeof groups = [];
    for (const g of groups) {
      const take = big ? g.items : g.items.slice(0, Math.max(0, cardMax - n));
      n += take.length;
      if (take.length > 0) out.push({ ...g, items: take });
    }
    return { cardGroups: out, shown: n };
  }, [groups, big, cardMax]);
  const hidden = open - shown;

  if (!api.loaded) return <p className="mid">Hämtar listan…</p>;

  return (
    <div ref={rootRef} className={`li${big ? " li-full" : ""}${shop ? " li-shop" : ""}`}>
      {!api.online && (
        <p className="li-offline" role="status"><WifiOff aria-hidden="true" />Ingen täckning. Ändringar sparas i telefonen och skickas när nätet är tillbaka{api.pendingCount > 0 ? ` (${api.pendingCount} väntar)` : ""}.</p>
      )}
      {api.error && <p className="err" role="alert">{api.error}</p>}

      {shop ? <Shop api={api} /> : (
        <>
          <div className="li-top">
            <div className="li-tabs" role="tablist" aria-label="Inköp, lappar eller middag">
              <button role="tab" type="button" aria-selected={tab === "shop"} onClick={() => setTab("shop")}>Inköp{open > 0 ? <b>{open}</b> : null}</button>
              <button role="tab" type="button" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>Lappar{state.notes.length > 0 ? <b>{state.notes.length}</b> : null}</button>
              <button role="tab" type="button" aria-selected={tab === "dinner"} onClick={() => setTab("dinner")}>Middag</button>
            </div>
            {compact && <Link className="li-expand" href={handlaHref} aria-label="Öppna butiksläget (stor vy för butiken)"><ArrowUpRight aria-hidden="true" /></Link>}
          </div>

          {tab === "shop" ? (
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
              {compact && hidden > 0 && <Link className="li-more" href={handlaHref}>+{hidden} till · öppna butiksläget</Link>}
              {open > 0 && big && <Chips api={api} limit={8} />}
              {done.length > 0 && (
                <section className="li-group li-done" aria-label="Avbockade">
                  <div className="li-donehead">
                    <button type="button" className="li-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                      {showDone ? "Dölj avbockade" : "Avbockade"} <b>{done.length}</b>
                    </button>
                    <button type="button" className="li-clear" onClick={api.clearChecked}><Trash2 aria-hidden="true" />Rensa</button>
                  </div>
                  {showDone && <ul className="li-list">{done.map((i) => <Row key={i.id} item={i} big={big} onToggle={(c) => api.toggle(i.id, c)} onRemove={() => api.remove(i.id)} />)}</ul>}
                </section>
              )}
              {big && <Link className="li-open" href={handlaHref}><span>Öppna butiksläget</span><small>bocka av medan du handlar</small></Link>}
            </>
          ) : tab === "notes" ? <Notes api={api} /> : <DinnerTab api={api} compactRows={compact ? dinnerRows : undefined} />}
        </>
      )}
    </div>
  );
}

