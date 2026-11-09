"use client";
import { Share2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ShareManager } from "../share-manager";

/** Dela-knapp med en panel där familjemedlemmar läggs till och får sin länk. Personerna hämtas först när panelen öppnas. */
export function ShareSheet() {
  const ref = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn" aria-label="Dela listan med familjen" title="Dela listan" onClick={() => { setOpened(true); ref.current?.showModal(); }}><Share2 aria-hidden="true" /></button>
      <dialog ref={ref} className="sheet" aria-labelledby="sheet-title" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="sheet-in">
          <header className="sheet-head">
            <h2 id="sheet-title">Dela listan</h2>
            <button type="button" className="icon-btn" aria-label="Stäng" onClick={() => ref.current?.close()}><X aria-hidden="true" /></button>
          </header>
          <p className="mid small">Skicka en länk till den du vill dela med. Hen kan lägga in varor och bocka av, och skriva lappar, men når inget annat i appen.</p>
          {opened && <ShareManager initial={null} />}
        </div>
      </dialog>
    </>
  );
}
