import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleSpotifyNow } from "@/server/spotify-now";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  const r = await handleSpotifyNow({ userId: user?.id ?? null });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
