"use client";
import { useEffect, useState } from "react";

interface Info { w: number; h: number; dpr: number; app: boolean }

/** Skärmens storlek som webbläsaren ser den, så att layouten kan anpassas mot det riktiga måttet. */
export function ScreenInfo() {
  const [i, setI] = useState<Info | null>(null);
  useEffect(() => {
    const read = () => setI({ w: window.innerWidth, h: window.innerHeight, dpr: Math.round(window.devicePixelRatio * 100) / 100, app: window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return (
    <section className="card" aria-label="Den här skärmen">
      <div className="card-head"><span className="name">Den här skärmen</span></div>
      {i ? (
        <div className="rows">
          <div className="row"><span>Storlek</span><span>{i.w} × {i.h} px</span></div>
          <div className="row"><span>Läge</span><span>{i.w >= i.h ? "Liggande" : "Stående"}</span></div>
          <div className="row"><span>Skärmtäthet</span><span>{i.dpr}×</span></div>
          <div className="row"><span>Visas som</span><span>{i.app ? "Installerad app" : "Webbläsare"}</span></div>
        </div>
      ) : <p className="mid">Läser av…</p>}
      <p className="mid small">Hemskärmen passar sig efter det här måttet. Är du på plattan och något inte sitter rätt, skriv av siffrorna.</p>
    </section>
  );
}
