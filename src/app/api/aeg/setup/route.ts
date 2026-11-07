import { NextResponse, type NextRequest } from "next/server";
import { handleAegSetup } from "@/server/aeg-connect";
import { getSessionUser } from "@/server/authz";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Ogiltig JSON hanteras som ogiltig indata.
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleAegSetup({ body, origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return r.json ? NextResponse.json(r.json, { status: r.status }) : new NextResponse(null, { status: r.status });
}
