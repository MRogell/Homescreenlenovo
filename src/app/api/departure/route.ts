import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleDeparture } from "@/server/departure/flow";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Ogiltig JSON hanteras som ogiltiga inställningar.
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleDeparture({ body, origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
