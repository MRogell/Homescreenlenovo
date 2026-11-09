import { NextResponse, type NextRequest } from "next/server";
import { handleGuestGet, handleGuestPost } from "@/server/share/flow";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await handleGuestGet({ token });
  return NextResponse.json(r.json, { status: r.status, headers });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Ogiltig JSON hanteras som ogiltig begäran.
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await handleGuestPost({ token, body, origin: req.headers.get("origin"), host });
  return NextResponse.json(r.json, { status: r.status, headers });
}
