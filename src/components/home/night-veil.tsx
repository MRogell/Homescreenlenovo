"use client";
import { useEffect, useState } from "react";
import { isNight, type AppSettings } from "@/lib/settings";

/**
 * Nattläge: ett halvgenomskinligt mörkt lager över hela sidan under de valda klockslagen (enhetens tid).
 * En webbapp kan inte ändra skärmens riktiga ljusstyrka, så detta dämpar bara bilden.
 * Lagret släpper igenom tryck, så att allt går att använda som vanligt.
 */
export function NightVeil({ night }: { night: AppSettings["night"] }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Enhetens tid finns först efter montering; då är serverns och klientens första rendering identiska.
    const tick = () => setOn(isNight(new Date(), night));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [night]);
  return on ? <div className="night-veil" aria-hidden="true" /> : null;
}
