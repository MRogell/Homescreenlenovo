import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistisk förkontroll (endast cookie finns). Den riktiga kontrollen sker på servern i requireUser().
export function proxy(req: NextRequest) {
  if (!getSessionCookie(req)) return NextResponse.redirect(new URL("/logga-in", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/installningar/:path*"] };
