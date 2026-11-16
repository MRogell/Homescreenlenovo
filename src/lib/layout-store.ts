"use client";
import { useSyncExternalStore } from "react";
import { DEFAULT_LAYOUT, LAYOUT_KEY, sanitizeLayout, type Layout } from "./layout";

let rawCache: string | null | undefined;
let cache: Layout = DEFAULT_LAYOUT;
const listeners = new Set<() => void>();

function read(): Layout {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LAYOUT_KEY);
  } catch {
    // Privat läge eller blockerad lagring: standardläget används.
  }
  if (raw !== rawCache) {
    rawCache = raw;
    try {
      cache = raw ? sanitizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT;
    } catch {
      cache = DEFAULT_LAYOUT;
    }
  }
  return cache;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
};

/** Layouten för den här enheten. Servern ritar alltid standardläget; enheten byter till sitt eget direkt efter första ritningen. */
export const useLayout = (): Layout => useSyncExternalStore(subscribe, read, () => DEFAULT_LAYOUT);

export function writeLayout(next: Layout): void {
  const clean = sanitizeLayout(next);
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(clean));
  } catch {
    // Går inte att spara: ändringen gäller bara tills sidan laddas om.
    rawCache = undefined;
    cache = clean;
  }
  listeners.forEach((f) => f());
}

export const resetLayout = () => writeLayout(DEFAULT_LAYOUT);
