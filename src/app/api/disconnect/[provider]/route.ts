import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/server/connect-flow";
import { deleteConnection } from "@/server/connections";
import { getSessionUser } from "@/server/authz";
import { isOAuthProvider } from "@/server/oauth-providers";

const canDisconnect = (p: string): p is "sonos" | "spotify" | "tado" => isOAuthProvider(p) || p === "tado";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!canDisconnect(provider)) return NextResponse.json({ error: "Okänd tjänst" }, { status: 404 });
  if (!(await getSessionUser())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!sameOrigin(req.headers.get("origin"), host)) return NextResponse.json({ error: "Ogiltigt ursprung" }, { status: 403 });
  await deleteConnection(provider);
  return new NextResponse(null, { status: 204 });
}
