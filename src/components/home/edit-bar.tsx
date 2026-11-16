"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Palette, RotateCcw, X } from "lucide-react";
import { DENSITIES, DENSITY_LABEL, TEXT_LABEL, TEXT_SIZES, THEMES, THEME_LABEL, type Layout } from "@/lib/layout";

/** Verktygsfältet i redigera-läget: utseende, återställ och klar. */
export function EditBar({ layout, onChange, onReset, onDone }: { layout: Layout; onChange: (l: Layout) => void; onReset: () => void; onDone: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const close = () => { dlg.current?.close(); setOpen(false); };
  return (
    <>
      <div className="edit-bar" role="toolbar" aria-label="Redigera hemskärmen">
        <span className="edit-hint">Dra korten eller använd pilarna. Välj storlek på varje kort.</span>
        <button type="button" className="sm-btn" onClick={() => setOpen(true)}><Palette aria-hidden="true" />Utseende</button>
        <button type="button" className="sm-btn" onClick={onReset}><RotateCcw aria-hidden="true" />Återställ</button>
        <button type="button" className="sm-btn primary" onClick={onDone}><Check aria-hidden="true" />Klar</button>
      </div>
      <dialog ref={dlg} className="sheet" aria-label="Utseende" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {open && (
          <div className="sheet-in">
            <header className="sheet-head">
              <h2>Utseende</h2>
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={close}><X aria-hidden="true" /></button>
            </header>
            <p className="mid small">Gäller bara den här enheten.</p>
            <fieldset className="ds-group"><legend className="dn-label">Färgtema</legend>
              <div className="ds-themes">{THEMES.map((t) => <button key={t} type="button" className="ds-theme" data-t={t} aria-pressed={layout.theme === t} onClick={() => onChange({ ...layout, theme: t })}><i aria-hidden="true" />{THEME_LABEL[t]}</button>)}</div>
            </fieldset>
            <fieldset className="ds-group"><legend className="dn-label">Tät eller luftig</legend>
              <div className="edit-seg wide" role="group">{DENSITIES.map((d) => <button key={d} type="button" aria-pressed={layout.density === d} onClick={() => onChange({ ...layout, density: d })}>{DENSITY_LABEL[d]}</button>)}</div>
            </fieldset>
            <fieldset className="ds-group"><legend className="dn-label">Textstorlek</legend>
              <div className="edit-seg wide" role="group">{TEXT_SIZES.map((t) => <button key={t} type="button" aria-pressed={layout.text === t} onClick={() => onChange({ ...layout, text: t })}>{TEXT_LABEL[t]}</button>)}</div>
            </fieldset>
            <p className="mid small">Luftig, större text och egna kortstorlekar gör att sidan kan behöva rulla på surfplattan.</p>
          </div>
        )}
      </dialog>
    </>
  );
}
