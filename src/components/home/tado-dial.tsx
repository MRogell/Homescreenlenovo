import { goalPoint, type TadoRoomView } from "./tado-view";

const R = 30;
const C = 2 * Math.PI * R;
const COLOR: Record<TadoRoomView["tone"], string> = { heating: "var(--warn)", cold: "var(--dial-cold)", ok: "var(--ok)", unknown: "var(--muted)" };

/** Ett rum som en ring: fyllnaden visar nuvarande temperatur på skalan 15–25 °C och den vita punkten visar målet. */
export function TadoDial({ r }: { r: TadoRoomView }) {
  const goal = r.goal === null ? null : goalPoint(r.goal);
  return (
    <div className={`ti-dial${r.tone === "heating" ? " heat" : ""}`}>
      <svg viewBox="0 0 80 80" role="img" aria-label={r.label}>
        <circle className="ti-ring" cx="40" cy="40" r={R} />
        {r.arc > 0 && <circle className="ti-arc" cx="40" cy="40" r={R} stroke={COLOR[r.tone]} strokeDasharray={`${r.arc * C} ${C}`} />}
        {goal && <circle className="ti-goal" cx={goal.x} cy={goal.y} r="3" />}
        <text x="40" y="46">{r.temp}</text>
        {/* Flamman ligger i ringen under temperaturen, så att namnen under kan bli långa och ändå ligga rakt. */}
        {r.tone === "heating" && <path className="ti-flame" transform="translate(34 52) scale(.5)" d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" />}
      </svg>
      <span className="ti-name">{r.name}</span>
    </div>
  );
}
