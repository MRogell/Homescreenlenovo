import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/authz";
import { getHomeStates } from "@/server/snapshots";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401, headers: NO_STORE });
  const now = new Date();
  // Endast normaliserad tjänstedata. Anslutningstokens (Connection.tokenEnc) läses aldrig här.
  return NextResponse.json({ states: await getHomeStates(now), now: now.toISOString() }, { headers: NO_STORE });
}
