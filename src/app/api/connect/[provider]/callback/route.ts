import { NextResponse, type NextRequest } from "next/server";
import { finishConnect } from "@/server/connect-flow";
import { getSessionUser } from "@/server/authz";
import { publicUrl, stateCookieName, stateCookieOptions } from "@/server/http";
import { isOAuthProvider } from "@/server/oauth-providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: "Okänd tjänst" }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(publicUrl("/logga-in"));
  const q = req.nextUrl.searchParams;
  const { redirectTo } = await finishConnect(
    provider,
    { code: q.get("code") ?? undefined, state: q.get("state") ?? undefined, error: q.get("error") ?? undefined },
    req.cookies.get(stateCookieName(provider))?.value,
    user.id,
  );
  const res = NextResponse.redirect(publicUrl(redirectTo));
  // Engångs: state-cookien rensas oavsett utfall.
  res.cookies.set(stateCookieName(provider), "", stateCookieOptions(0));
  return res;
}
