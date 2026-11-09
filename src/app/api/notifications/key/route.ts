import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleKey } from "@/server/notify/flow";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleKey({ origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
