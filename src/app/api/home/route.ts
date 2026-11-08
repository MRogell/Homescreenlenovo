import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/authz";
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
  return NextResponse.json({ states, now: now.toISOString(), settings }, { headers: NO_STORE });
}
