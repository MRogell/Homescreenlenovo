import { formatAgo } from "@/lib/format";
import type { CardState } from "@/server/providers/types";
import { Icon, type IconName } from "./icons";
import { CARD_IDS, type CardId } from "@/lib/settings";
import { useLayout } from "@/lib/layout-store";
import { useCardEdit } from "./edit-overlay";

type Pill = { text: string; tone?: "ok" | "warn" | "bad" };

interface Props<T> {
  title: string;
  icon: IconName;
  state: CardState<T> | undefined;
  now: Date;
  /** Innehåll för ok och stale. Returnerar även statuspillret. */
  render: (data: T) => { pill?: Pill; body: React.ReactNode };
  /** Texten på kortet innan tjänsten är ansluten: en kort rubrik, en mening om vad kortet ger och knappens text. */
  off?: { big: string; text: string; cta?: string };
  /** Dölj raden "Uppdaterad …" (för kort som alltid är live, som inköpslistan). */
  noFoot?: boolean;
  /** Extra klass, t.ex. för kort som tar två kolumner. */
  className?: string;
  /** Extra stil på kortet, t.ex. en färgton (--wx-tint) som beror på datan. */
  style?: (data: T) => React.CSSProperties | undefined;
}

/** Orsak i klartext på svenska. Okända (ofta engelska) fel visas inte, bara den vanliga texten. */
export function friendlyReason(reason: string | undefined): { text: string; reconnect: boolean } {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("anslut igen") || r.includes("återkallat") || r.includes("nekade åtkomst")) return { text: "Anslutningen behöver göras om.", reconnect: true };
  if (r.includes("begränsar")) return { text: "Tjänsten begränsar anropen just nu. Försöker igen automatiskt.", reconnect: false };
  if (r.includes("i tid")) return { text: "Tjänsten svarade inte i tid. Försöker igen.", reconnect: false };
  return { text: "Tjänsten svarar inte just nu.", reconnect: false };
}

/** Gemensam ram som hanterar alla fyra lägen. Tjänsterna renderar bara sin egen data. */
export function CardShell<T>({ title, icon, state, now, render, off, noFoot, className = "", style }: Props<T>) {
  // Kortets id är första klassen (weather, skoda …): används för egen storlek och redigera-läget.
  const first = className.split(" ")[0] ?? "";
  const id = (CARD_IDS as readonly string[]).includes(first) ? (first as CardId) : null;
  const size = useLayout().sizes[id ?? "weather"];
  const { props: editProps, overlay } = useCardEdit(id);
  const common = { ...editProps, "data-size": id && size ? size : undefined } as React.HTMLAttributes<HTMLElement>;
  if (!state || state.status === "not_connected") {
    return (
      <section className={`card off ${className}`} aria-label={title} {...common}>
        <div className="card-head"><Icon name={icon} /><span className="name">{title}</span><span className="pill">Ej ansluten</span></div>
        <div className="big">{off?.big ?? "Anslut"}</div>
        <div className="mid">{off?.text ?? `Visa ${title} här.`}</div>
        <a className="btn" href="/installningar">{off?.cta ?? `Anslut ${title}`}</a>
        {overlay}
      </section>
    );
  }
  if (state.status === "unavailable") {
    return (
      <section className={`card off ${className}`} aria-label={title} {...common}>
        <div className="card-head"><Icon name={icon} /><span className="name">{title}</span><span className="pill bad">Ej tillgänglig</span></div>
        <div className="mid">{friendlyReason(state.reason).text}</div>
        {friendlyReason(state.reason).reconnect && <a className="btn" href="/installningar">Anslut igen</a>}
        {/* Den tekniska orsaken (ofta på engelska) visas inte; den finns kvar som tooltip och i diagnosen. */}
        <div className="foot" title={state.reason}>Försöker igen om en stund.</div>
        {overlay}
      </section>
    );
  }
  const { pill, body } = render(state.data);
  return (
    <section {...common} className={`card ${className}`} aria-label={title} data-stale={state.status === "stale" ? "" : undefined} style={style?.(state.data)}>
      <div className="card-head">
        <Icon name={icon} /><span className="name">{title}</span>
        {state.status === "stale" ? <span className="pill warn">Gammal data</span> : pill && <span className={`pill ${pill.tone ?? ""}`}>{pill.text}</span>}
      </div>
      {body}
      {!(noFoot && state.status === "ok") && <div className="foot">{state.status === "stale" ? `Visar senast kända data (${formatAgo(state.fetchedAt, now)})` : `Uppdaterad ${formatAgo(state.fetchedAt, now)}`}</div>}
      {overlay}
    </section>
  );
}
