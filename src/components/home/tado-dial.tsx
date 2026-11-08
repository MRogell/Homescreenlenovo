import { Flame } from "lucide-react";
import { goalPoint, type TadoRoomView } from "./tado-view";

const R = 30;
const C = 2 * Math.PI * R;
const COLOR: Record<TadoRoomView["tone"], string> = { heating: "var(--warn)", cold: "var(--dial-cold)", ok: "var(--ok)", unknown: "var(--muted)" };

/** Ett rum som en ring: fyllnaden visar nuvarande temperatur på skalan 15–25 °C och den vita punkten visar målet. */
export function TadoDial({ r }: { r: TadoRoomView }) {
  const goal = r.goal === null ? null : goalPoint(r.goal);
  return (
    <div className="ti-dial">
      <svg viewBox="0 0 80 80" role="img" aria-label={r.label}>
        <circle className="ti-ring" cx="40" cy="40" r={R} />
        {r.arc > 0 && <circle className="ti-arc" cx="40" cy="40" r={R} stroke={COLOR[r.tone]} strokeDasharray={`${r.arc * C} ${C}`} />}
        {goal && <circle className="ti-goal" cx={goal.x} cy={goal.y} r="3" />}
        <text x="40" y="47">{r.temp}</text>
      </svg>
      <span className="ti-name">{r.tone === "heating" && <Flame aria-hidden="true" />}{r.name}</span>
    </div>
  );
}
