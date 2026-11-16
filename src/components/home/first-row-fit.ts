"use client";
import { useEffect, type RefObject } from "react";

/** Liggande surfplatta eller dator. Under 900 px höjd (P12) eller med egen layout rullar sidan, men första raden ska ändå synas helt. */
const WIDE = "(min-width: 1001px) and (orientation: landscape)";
const LOW = "(max-height: 899px)";
export const MIN_ZOOM = 0.7;
const BOTTOM_GAP = 16;

const clamp = (z: number) => Math.min(1, Math.max(MIN_ZOOM, z));

/**
 * Krymper korten i första raden (de som ligger överst) lika mycket tills de ryms på skärmen utan att rulla.
 * `zoom` gör att innehållet får mer bredd och bryts om, så texten blir inte bara mindre utan också lägre. Mindre än MIN_ZOOM görs aldrig.
 * Returnerar zoomen som användes (1 = ingen ändring).
 */
export function fitFirstRow(grid: HTMLElement): number {
  const cards = [...grid.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains("card"));
  for (const c of cards) c.style.zoom = "";
  if (cards.length === 0) return 1;
  grid.classList.add("measuring");
  try {
    const rects = cards.map((c) => c.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top));
    const row = cards.filter((_, i) => Math.abs(rects[i]!.top - top) < 2);
    const available = window.innerHeight - (top + window.scrollY) - BOTTOM_GAP; // höjden från sidans topp till skärmens nederkant
    const tallest = () => Math.max(...row.map((c) => c.getBoundingClientRect().height));
    const natural = tallest();
    if (natural <= available + 1 || available <= 0) return 1;
    let z = clamp(available / natural);
    for (let i = 0; i < 5; i++) {
      for (const c of row) c.style.zoom = String(z);
      const h = tallest();
      if (h <= available + 1 || z <= MIN_ZOOM) break;
      z = clamp(z * (available / h) * 0.99);
    }
    return z;
  } finally {
    grid.classList.remove("measuring");
  }
}

/** Kör fitFirstRow när innehållet, layouten eller skärmen ändras. `free` = egen layout (då gäller det även höga skärmar). */
export function useFirstRowFit(ref: RefObject<HTMLElement | null>, free: boolean, deps: readonly unknown[]) {
  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const wide = window.matchMedia(WIDE);
    const low = window.matchMedia(LOW);
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (wide.matches && (low.matches || free)) fitFirstRow(grid);
        else for (const c of grid.children) if (c instanceof HTMLElement) c.style.zoom = "";
      });
    };
    run();
    window.addEventListener("resize", run);
    void document.fonts?.ready.then(run);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", run);
      for (const c of grid.children) if (c instanceof HTMLElement) c.style.zoom = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, free, ...deps]);
}
