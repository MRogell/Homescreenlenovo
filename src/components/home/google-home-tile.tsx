"use client";
import { House } from "lucide-react";
import { useEffect, useState } from "react";
import { GOOGLE_HOME_WEB, googleHomeLinks, type GoogleHomeLinks } from "@/lib/google-home";

/** Stor ruta som öppnar Google Home (appen på Android, annars webbversionen). Visar ingen egen data. */
export function GoogleHomeTile() {
  const [links, setLinks] = useState<GoogleHomeLinks>({ web: GOOGLE_HOME_WEB });
  useEffect(() => {
    // Läses efter montering så att serverns och klientens första rendering är identiska.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinks(googleHomeLinks(navigator.userAgent));
  }, []);

  return (
    <section className="card gh" aria-label="Google Home">
      <div className="card-head"><House aria-hidden="true" className="gh-icon" /><span className="name">Google Home</span></div>
      <div className="big text">Lampor, värme och uttag</div>
      <p className="mid">Styr allt som är kopplat till Google Home, till exempel Plejd, Tado och Tapo.</p>
      <div className="gh-actions">
        {links.app ? (
          <>
            <a className="btn" href={links.app}>Öppna Google Home</a>
            <a className="btn secondary" href={links.web} target="_blank" rel="noopener noreferrer">Webbversion</a>
          </>
        ) : (
          <a className="btn" href={links.web} target="_blank" rel="noopener noreferrer">Öppna Google Home</a>
        )}
      </div>
    </section>
  );
}
