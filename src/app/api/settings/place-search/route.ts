import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { PlaceSearchError, searchPlaces } from "@/server/place-search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  try {
    const places = await searchPlaces(req.nextUrl.searchParams.get("q") ?? "");
    return NextResponse.json({ places }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const err = e instanceof PlaceSearchError ? e : new PlaceSearchError("failed");
    return NextResponse.json({ error: err.message }, { status: err.code === "invalid" ? 400 : 502 });
  }
}
