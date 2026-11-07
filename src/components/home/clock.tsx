"use client";
import { useEffect, useState } from "react";

function greeting(h: number) {
  return h < 5 ? "God natt" : h < 10 ? "God morgon" : h < 17 ? "Hej" : "God kväll";
}

export function Clock() {
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
        <h1>{now ? greeting(now.getHours()) : "Hej"}</h1>
        <div className="sub">Allt hemma just nu</div>
      </div>
      <div className="clock" aria-live="off">
        <b>{now ? now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</b>
        <span>{now ? now.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" }) : " "}</span>
      </div>
    </>
  );
}
