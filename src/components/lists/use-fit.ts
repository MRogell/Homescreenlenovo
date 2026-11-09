"use client";
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** Samma villkor som i CSS (globals.css, "Allt på en skärm"): bred, liggande surfplatta eller dator. */
export const FIT_QUERY = "(min-width: 1001px) and (min-height: 540px) and (orientation: landscape)";

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(FIT_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
/** Sant när hemskärmen ligger i läget "allt på en skärm" (korten får en bestämd höjd). */
export const useFitMode = () => useSyncExternalStore(subscribe, () => window.matchMedia(FIT_QUERY).matches, () => false);

/** Höjden på kortet som innehållet ligger i (0 tills den är mätt). Används för att välja hur många rader som får plats. */
export function useCardHeight(ref: RefObject<HTMLElement | null>, enabled: boolean): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const card = ref.current?.closest("section");
    if (!enabled || !card) return;
    const ro = new ResizeObserver(() => setH(Math.round(card.getBoundingClientRect().height)));
    ro.observe(card);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return enabled ? h : 0;
}
