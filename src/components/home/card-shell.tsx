import { formatAgo } from "@/lib/format";
import type { CardState } from "@/server/providers/types";
import { Icon, type IconName } from "./icons";

type Pill = { text: string; tone?: "ok" | "warn" | "bad" };

interface Props<T> {
  title: string;
  icon: IconName;
  state: CardState<T> | undefined;
  now: Date;
  /** Innehåll för ok och stale. Returnerar även statuspillret. */
  render: (data: T) => { pill?: Pill; body: React.ReactNode };
  /** Extra klass, t.ex. för kort som tar två kolumner. */
  className?: string;
}

/** Gemensam ram som hanterar alla fyra lägen. Tjänsterna renderar bara sin egen data. */
export function CardShell<T>({ title, icon, state, now, render, className = "" }: Props<T>) {
  if (!state || state.status === "not_connected") {
    return (
      <section className={`card off ${className}`} aria-label={title}>
        <div className="card-head"><Icon name={icon} /><span className="name">{title}</span><span className="pill">Ej ansluten</span></div>
        <div className="big">Anslut</div>
        <div className="mid">Visa {title} här.</div>
        <a className="btn" href="/installningar">Anslut {title}</a>
      </section>
    );
  }
  if (state.status === "unavailable") {
    return (
      <section className={`card off ${className}`} aria-label={title}>
        <div className="card-head"><Icon name={icon} /><span className="name">{title}</span><span className="pill bad">Ej tillgänglig</span></div>
        <div className="mid">Tjänsten svarar inte just nu.</div>
        <div className="foot">{state.reason}</div>
      </section>
    );
  }
  const { pill, body } = render(state.data);
  return (
    <section className={`card ${className}`} aria-label={title}>
      <div className="card-head">
        <Icon name={icon} /><span className="name">{title}</span>
        {state.status === "stale" ? <span className="pill bad">Ej tillgänglig</span> : pill && <span className={`pill ${pill.tone ?? ""}`}>{pill.text}</span>}
      </div>
      {body}
      <div className="foot">{state.status === "stale" ? `Visar senast kända data (${formatAgo(state.fetchedAt, now)})` : `Uppdaterad ${formatAgo(state.fetchedAt, now)}`}</div>
    </section>
  );
}
