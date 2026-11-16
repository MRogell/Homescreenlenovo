"use client";
import { Utensils } from "lucide-react";
import { useEffect, useState } from "react";

function greeting(h: number) {
  return h < 5 ? "God natt" : h < 10 ? "God morgon" : h < 17 ? "Hej" : "God kväll";
}

/** `note`: raden under hälsningen. Bara det som kräver uppmärksamhet; tom när allt är som det ska. Platsen är reserverad så att inget hoppar. */
export function Clock({ note = null, tone = null, trailing = null, extras = null, dinner = null }: { note?: string | null; tone?: "yellow" | "orange" | "red" | null; trailing?: React.ReactNode; extras?: React.ReactNode; dinner?: { dish: string; people: string } | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Sätts efter montering så att serverns och klientens första rendering är identiska.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div>
        <div className="greet-row"><h1>{now ? greeting(now.getHours()) : "Hej"}</h1>{extras}</div>
        <div className="sub" role="status" data-tone={tone ?? undefined}>{note ?? "\u00a0"}</div>
      </div>
      {dinner && (
        <div className="dn-hero" role="group" aria-label={`Middag idag: ${dinner.dish}, ${dinner.people}`}>
          <span className="dn-hero-label"><Utensils aria-hidden="true" />Middag idag</span>
          <b className="dn-hero-dish">{dinner.dish}</b>
          <span className="dn-hero-people">{dinner.people}</span>
        </div>
      )}
      <div className="top-right">
        <div className="clock" aria-live="off">
          <b>{now ? now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</b>
          <span>{now ? now.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" }) : " "}</span>
        </div>
        {trailing}
      </div>
    </>
  );
}
