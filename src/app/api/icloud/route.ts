import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getSessionUser } from "@/server/authz";
import { discoverCalendars, CaldavError } from "@/server/calendar/caldav";
import { removeIcloud, saveIcloud } from "@/server/calendar/icloud-store";
import { sameOrigin } from "@/server/connect-flow";

export const dynamic = "force-dynamic";
const body = z.object({ user: z.string().trim().min(3).max(120), password: z.string().trim().min(8).max(60) }).strict();

async function gate(req: NextRequest): Promise<NextResponse | null> {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!sameOrigin(req.headers.get("origin"), host)) return NextResponse.json({ error: "Ogiltigt ursprung" }, { status: 403 });
  return null;
}

/** Kopplar iCloud: inloggningen prövas först (appspecifikt lösenord), sedan sparas den krypterad. */
export async function POST(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Fyll i Apple-ID och det appspecifika lösenordet." }, { status: 400 });
  try {
    const cals = await discoverCalendars(p.data);
    if (cals.length === 0) return NextResponse.json({ error: "Hittade inga kalendrar i iCloud." }, { status: 400 });
    await saveIcloud(p.data, getEnv().BETTER_AUTH_SECRET);
    return NextResponse.json({ ok: true, calendars: cals.map((c) => c.name) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CaldavError && e.kind === "auth") return NextResponse.json({ error: "iCloud nekade inloggningen. Använd ett appspecifikt lösenord, inte ditt vanliga." }, { status: 400 });
    return NextResponse.json({ error: "Det gick inte att nå iCloud. Försök igen om en stund." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;
  await removeIcloud();
  return NextResponse.json({ ok: true });
}
