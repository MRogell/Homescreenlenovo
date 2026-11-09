import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleListsGet, handleListsPost } from "@/server/lists/flow";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  const r = await handleListsGet({ userId: user?.id ?? null });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Ogiltig JSON hanteras som ogiltig begäran.
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleListsPost({ body, origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
