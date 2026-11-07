import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleControl } from "@/server/control-flow";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const user = await getSessionUser();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Ogiltig JSON hanteras som ogiltigt kommando.
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleControl({ provider, body, origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return r.json ? NextResponse.json(r.json, { status: r.status }) : new NextResponse(null, { status: r.status });
}
