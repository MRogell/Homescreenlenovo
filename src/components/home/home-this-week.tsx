"use client";
import { useEffect, useRef, useState } from "react";
import { Home, Repeat, X } from "lucide-react";
import { DEFAULT_HANDOVER, MEMBER_COLORS, nextHandover, WEEKDAYS_SHORT, type FamilyMember, type Handover } from "@/lib/activity";
import { isChildWeek } from "@/lib/dinner";
import { localClock, localDate } from "@/server/calendar/time";

const MONTHS = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** Märket (Barnvecka / Vecka N) som öppnar en ruta med vilka som är hemma den här veckan. Rutan är diskret: den syns bara när man trycker. */
export function WeekChipButton({ now, awayIds = [], className, children }: { now: Date; awayIds?: string[]; className: string; children: React.ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [handover, setHandover] = useState<Handover>(DEFAULT_HANDOVER);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const close = () => { dlg.current?.close(); setOpen(false); };
  const show = () => {
    setOpen(true);
    fetch("/api/family", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { members?: FamilyMember[]; handover?: Handover } | null) => { if (j?.members) { setMembers(j.members); if (j.handover) setHandover(j.handover); } }).catch(() => setMembers([]));
  };

  const today = localDate(now);
  const child = isChildWeek(today);
  const colorOf = (m: FamilyMember) => MEMBER_COLORS[(members ?? []).indexOf(m) % MEMBER_COLORS.length]!;
  const present = (members ?? []).filter((m) => (child || m.kind === "adult") && !awayIds.includes(m.id));
  const away = (members ?? []).filter((m) => (child || m.kind === "adult") && awayIds.includes(m.id));
  const next = nextHandover(today, localClock(now).minutes, handover);
  const nextText = `${WEEKDAYS_SHORT[next.weekday - 1]} ${Number(next.date.slice(8))} ${MONTHS[Number(next.date.slice(5, 7)) - 1]} ${next.time}`;
  const pill = (m: FamilyMember) => <li key={m.id} className="hw-pill" style={{ "--p": colorOf(m) } as React.CSSProperties}><span className="hw-av" aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span>{m.name}</li>;

  return (
    <>
      <button type="button" className={`${className} hw-trigger`} onClick={show} aria-haspopup="dialog" aria-label="Visa vilka som är hemma den här veckan">{children}</button>
      <dialog ref={dlg} className="sheet" aria-label="Hemma den här veckan" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {open && (
          <div className="sheet-in">
            <header className="sheet-head">
              <h2><Home aria-hidden="true" className="hw-ico" /> Hemma den här veckan</h2>
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={close}><X aria-hidden="true" /></button>
            </header>
            {members === null ? <p className="mid">Hämtar…</p> : members.length === 0 ? (
              <p className="mid">Lägg till familjemedlemmar under Inställningar → Familjen, så visas de här.</p>
            ) : (
              <>
                {!child && <p className="mid">Barnen är hos andra hushållet hela veckan.</p>}
                {present.length > 0 ? <ul className="hw-list">{present.map(pill)}</ul> : <p className="mid">Ingen är hemma.</p>}
                {away.length > 0 && <p className="mid small">Bortrest: {away.map((m) => m.name).join(", ")}</p>}
                <p className="hw-next mid"><Repeat aria-hidden="true" />Nästa växling {nextText}</p>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
