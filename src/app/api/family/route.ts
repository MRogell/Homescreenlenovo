import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/authz";
import { familyBody, loadFamilyAll, saveFamily } from "@/server/calendar/family-store";
import { sameOrigin } from "@/server/connect-flow";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store" };

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  return NextResponse.json(await loadFamilyAll(), { headers: H });
}

/** Ersätter hela listan med familjemedlemmar (namn och vuxen/barn). */
export async function PUT(req: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!sameOrigin(req.headers.get("origin"), host)) return NextResponse.json({ error: "Ogiltigt ursprung" }, { status: 403 });
  const p = familyBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Ogiltiga uppgifter." }, { status: 400 });
  return NextResponse.json(await saveFamily(p.data.members.map((m) => ({ id: m.id, name: m.name, kind: m.kind })), p.data.handover), { headers: H });
}
