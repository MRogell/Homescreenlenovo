import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { handleSubscribe, handleUnsubscribe, type NotifyResult } from "@/server/notify/flow";

export const dynamic = "force-dynamic";

async function run(req: NextRequest, fn: (r: { body: unknown; origin: string | null; host: string | null; userId: string | null }) => Promise<NotifyResult>) {
  const user = await getSessionUser();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Ogiltig JSON hanteras som ogiltig begäran.
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const r = await fn({ body, origin: req.headers.get("origin"), host, userId: user?.id ?? null });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

export const POST = (req: NextRequest) => run(req, (r) => handleSubscribe(r));
export const DELETE = (req: NextRequest) => run(req, (r) => handleUnsubscribe(r));
