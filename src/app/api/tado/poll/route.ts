import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleTadoPoll } from "@/server/tado-connect";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleTadoPoll({ origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return r.json ? NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } }) : new NextResponse(null, { status: r.status });
}
