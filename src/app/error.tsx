"use client";
import Link from "next/link";
import { useEffect } from "react";

/** Visas när en sida kraschar på servern. Ofta ett tillfälligt fel (databas eller tjänst), så ett nytt försök brukar räcka. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Koden (digest) hittas i Vercels loggar och visas nedan så att felet går att spåra.
    console.error("Sidfel", error.digest ?? "");
  }, [error]);
  return (
    <main className="wrap">
      <section className="card" role="alert" style={{ maxWidth: 520, margin: "10vh auto 0" }}>
        <div className="card-head"><span className="name">Sidan kunde inte laddas</span></div>
        <p className="mid">Något gick fel på servern. Det är ofta tillfälligt. Försök igen om en stund.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="sm-btn primary" onClick={() => reset()}>Försök igen</button>
          <Link className="sm-btn" href="/">Till hemskärmen</Link>
        </div>
        {error.digest && <p className="mid small">Felkod: {error.digest}</p>}
      </section>
    </main>
  );
}
