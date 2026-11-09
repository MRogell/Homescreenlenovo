"use client";
import { ShareManager, type ShareRow } from "./share-manager";

export type { ShareRow };

/** Familjen i Inställningar: delning av inköpslistan och lapparna. */
export function ShareSettings({ initial, origin }: { initial: ShareRow[]; origin: string }) {
  return (
    <section className="card sharesettings" aria-label="Familjen">
      <div className="card-head"><span className="name">Familjen</span></div>
      <p className="mid small">Dela inköpslistan och lapparna. Varje person får en egen länk som bara öppnar de två: inga bilkommandon, ingen musik, inga inställningar. Det de skriver märks med deras namn. Den som har länken kan läsa och ändra listan, och tas länken bort slutar den fungera direkt.</p>
      <ShareManager initial={initial} origin={origin} />
    </section>
  );
}
