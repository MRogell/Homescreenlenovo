import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/server/authz";
import { getDepartureView, preheatTick } from "@/server/departure/tick";
import { getSettings } from "@/server/settings";
import { getHomeStates } from "@/server/snapshots";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401, headers: NO_STORE });
  const now = new Date();
  // Endast normaliserad tjänstedata. Anslutningstokens (Connection.tokenEnc) läses aldrig här.
  const [states, settings] = await Promise.all([getHomeStates(now), getSettings()]);
  // Förvärm till avresa: hemskärmen hämtar var 30:e sekund och är därför den som märker att det är dags. Körs efter svaret.
  after(() => preheatTick(states, now));
  const departure = await getDepartureView(states, now);
  return NextResponse.json({ states, now: now.toISOString(), settings, departure }, { headers: NO_STORE });
}
