"use client";
import { useEffect } from "react";

/**
 * Safari på iPhone ignorerar `user-scalable=no` av tillgänglighetsskäl. Nyp-zoom stoppas därför via iOS egna
 * gesthändelser. Dubbeltryck-zoom stoppas med `touch-action: manipulation` i CSS.
 */
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("gestureend", stop, opts);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
    };
  }, []);
  return null;
}
