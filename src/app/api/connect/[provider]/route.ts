import { NextResponse, type NextRequest } from "next/server";
import { startConnect } from "@/server/connect-flow";
import { getSessionUser } from "@/server/authz";
import { publicUrl, stateCookieName, stateCookieOptions } from "@/server/http";
import { isOAuthProvider } from "@/server/oauth-providers";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: "Okänd tjänst" }, { status: 404 });
  if (!(await getSessionUser())) return NextResponse.redirect(publicUrl("/logga-in"));
  const started = startConnect(provider);
  if ("error" in started) return NextResponse.redirect(publicUrl(`/installningar?tjanst=${provider}&fel=${started.error}`));
  const res = NextResponse.redirect(started.redirectTo);
  res.cookies.set(stateCookieName(provider), started.state, stateCookieOptions(600));
  return res;
}
