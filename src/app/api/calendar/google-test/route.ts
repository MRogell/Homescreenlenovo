import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/authz";
import { getAccessToken, getConnectionStatus, ReauthRequired } from "@/server/connections";
import { googleHint, listGoogleCalendars, listGoogleEvents } from "@/server/calendar/google";

export const dynamic = "force-dynamic";

/** Testar Google-anslutningen steg för steg och svarar med en begriplig orsak (aldrig token). */
export async function POST() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const status = await getConnectionStatus("google");
  if (status === "none") return NextResponse.json({ ok: false, step: "anslutning", text: "Google är inte ansluten. Tryck Anslut Google." });
  if (status !== "ok") return NextResponse.json({ ok: false, step: "anslutning", text: "Anslutningen behöver göras om. Tryck Anslut igen." });
  let token: string;
  try {
    token = await getAccessToken("google");
  } catch (e) {
    return NextResponse.json({ ok: false, step: "token", text: e instanceof ReauthRequired ? "Anslutningen har återkallats. Anslut Google igen." : "Det gick inte att förnya Googles inloggning. Anslut Google igen." });
  }
  try {
    const cals = await listGoogleCalendars(token);
    const now = new Date();
    const events = await Promise.all(cals.map((c) => listGoogleEvents(token, c.id, now, new Date(now.getTime() + 86_400_000)).then((e) => e.length, () => -1)));
    const bad = cals.filter((_, i) => events[i] === -1).map((c) => c.name);
    return NextResponse.json({ ok: bad.length === 0, step: "kalendrar", text: `${cals.length} kalender${cals.length === 1 ? "" : "ar"} hittades (${cals.map((c) => c.name).join(", ") || "inga"}).${bad.length ? ` Det gick inte att läsa händelser från: ${bad.join(", ")}.` : " Allt fungerar."}` });
  } catch (e) {
    return NextResponse.json({ ok: false, step: "kalendrar", text: googleHint(e) });
  }
}
