"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyOps, autocomplete, EMPTY_LISTS, itemKey, parseItem, splitInput, suggestions, type ListsState, type Op } from "@/lib/shopping";

const STORE_KEY = "lists-v1";
const BATCH = 60;
const RETRY_MS = [3_000, 8_000, 20_000, 45_000];

interface Stored { server: ListsState; pending: Op[] }

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<Stored>;
    if (!j || typeof j !== "object" || !j.server || !Array.isArray(j.pending)) return null;
    return { server: { ...EMPTY_LISTS, ...j.server }, pending: j.pending };
  } catch {
    return null;
  }
}
function writeStored(s: Stored) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Privat läge eller full lagring: listan fungerar ändå, men överlever inte en omstart offline.
  }
}

export const newId = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
};

export interface AddResult { added: string[]; existing: string[] }

/**
 * Listorna som en webbläsare ser dem. Det som visas är serverns senaste tillstånd med alla ännu ej skickade ändringar ovanpå,
 * så att allt svarar direkt och fungerar utan täckning. Ändringarna köas (och sparas i telefonen), skickas i omgångar och
 * kan skickas om utan risk eftersom varje har ett eget id. Servern har sista ordet.
 */
export function useLists(initial: ListsState | null, pollMs = 20_000) {
  const [server, setServer] = useState<ListsState>(initial ?? EMPTY_LISTS);
  const [pending, setPending] = useState<Op[]>([]);
  const [loaded, setLoaded] = useState(initial !== null);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Op[]>([]);
  const serverRef = useRef<ListsState>(server);
  const inflight = useRef(false);
  const retry = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = useCallback((s: ListsState, p: Op[]) => {
    serverRef.current = s;
    pendingRef.current = p;
    setServer(s);
    setPending(p);
    writeStored({ server: s, pending: p });
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (inflight.current || pendingRef.current.length === 0) return;
    inflight.current = true;
    clearTimeout(timer.current);
    try {
      while (pendingRef.current.length > 0) {
        const batch = pendingRef.current.slice(0, BATCH);
        let res: Response;
        try {
          res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: batch }) });
        } catch {
          setOnline(false);
          const wait = RETRY_MS[Math.min(retry.current++, RETRY_MS.length - 1)]!;
          timer.current = setTimeout(() => void flush(), wait);
          return;
        }
        if (res.ok) {
          const j = (await res.json().catch(() => null)) as { lists?: ListsState } | null;
          retry.current = 0;
          setOnline(true);
          setError(null);
          commit(j?.lists ?? serverRef.current, pendingRef.current.slice(batch.length));
        } else if (res.status >= 500) {
          setOnline(false);
          const wait = RETRY_MS[Math.min(retry.current++, RETRY_MS.length - 1)]!;
          timer.current = setTimeout(() => void flush(), wait);
          return;
        } else {
          // 400/401/403: att skicka om hjälper inte. Släpp omgången så att kön inte fastnar för alltid.
          setError(res.status === 401 ? "Du är utloggad. Logga in igen." : "Ändringen kunde inte sparas.");
          commit(serverRef.current, pendingRef.current.slice(batch.length));
          if (res.status === 401) return;
        }
      }
    } finally {
      inflight.current = false;
    }
  }, [commit]);

  const enqueue = useCallback((ops: Op[]) => {
    if (ops.length === 0) return;
    commit(serverRef.current, [...pendingRef.current, ...ops]);
    void flush();
  }, [commit, flush]);

  const pull = useCallback(async () => {
    if (inflight.current || pendingRef.current.length > 0) return;
    try {
      const res = await fetch("/api/lists", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { lists?: ListsState };
      if (j.lists && !inflight.current && pendingRef.current.length === 0) { commit(j.lists, []); setLoaded(true); }
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [commit]);

  // Start: ta upp köade ändringar och sista kända läge från telefonen (efter första ritningen, så att servern och klienten ritar lika).
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      commit(initial ?? stored.server, stored.pending);
      setLoaded(true);
    }
    if (stored?.pending.length) void flush(); else void pull();
    setOnline(navigator.onLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hämta regelbundet medan fliken syns, och direkt när den blir synlig eller nätet kommer tillbaka.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") { void flush(); void pull(); } };
    const t = setInterval(tick, pollMs);
    const on = () => { setOnline(true); void flush(); void pull(); };
    const off = () => setOnline(false);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); clearTimeout(timer.current); document.removeEventListener("visibilitychange", tick); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush, pull, pollMs]);

  const state = useMemo(() => applyOps(server, pending), [server, pending]);

  const add = useCallback((text: string): AddResult => {
    const result: AddResult = { added: [], existing: [] };
    const now = Date.now();
    const known = new Set(applyOps(serverRef.current, pendingRef.current).items.filter((i) => !i.checked).map((i) => itemKey(i.name)));
    const ops: Op[] = [];
    for (const part of splitInput(text)) {
      const p = parseItem(part);
      if (!p) continue;
      const key = itemKey(p.name);
      if (known.has(key)) { result.existing.push(p.name); continue; }
      known.add(key);
      result.added.push(p.name);
      ops.push({ op: "add", id: newId(), name: p.name, qty: p.qty, at: now });
    }
    enqueue(ops);
    return result;
  }, [enqueue]);

  const toggle = useCallback((id: string, checked: boolean) => enqueue([{ op: "check", id, checked, at: Date.now() }]), [enqueue]);
  const remove = useCallback((id: string) => enqueue([{ op: "remove", id }]), [enqueue]);
  const clearChecked = useCallback(() => enqueue([{ op: "clearChecked" }]), [enqueue]);
  const noteAdd = useCallback((text: string) => { if (text.trim()) enqueue([{ op: "noteAdd", id: newId(), text, at: Date.now() }]); }, [enqueue]);
  const noteRemove = useCallback((id: string) => enqueue([{ op: "noteRemove", id }]), [enqueue]);

  return {
    state, loaded, online, error, pendingCount: pending.length,
    add, toggle, remove, clearChecked, noteAdd, noteRemove,
    suggest: useCallback((n = 8) => suggestions(state, n), [state]),
    complete: useCallback((typed: string) => autocomplete(state, typed), [state]),
  };
}
