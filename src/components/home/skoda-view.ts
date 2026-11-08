import type { SkodaData } from "@/server/providers/schemas";

export type Tone = "ok" | "warn" | "bad";
export interface SkodaCheck { label: string; value: string; tone: Tone }
export interface SkodaView {
  pill: { text: string; tone?: Tone };
  /** "78 % batteri", eller null om nivån saknas. */
  levelText: string | null;
  /** Bara när bilen laddar: "11 kW · klar ca 19:35 · mål 80 %" (hårda mellanslag), eller "Laddar" om detaljer saknas. */
  chargeLine: string | null;
  /** Laddmål som markering i stapeln, bara när bilen laddar. */
  targetPct: number | null;
  /** Lås, dörrar, fönster, bagage (och motorhuv om den står öppen). Värden bilen inte rapporterar utelämnas. */
  checks: SkodaCheck[];
  place: string;
  reported: string | null;
}

// Fast tidszon: samma text på servern (UTC) och i plattan, så att sidan inte ritas om vid hydrering.
const TZ = "Europe/Stockholm";
const clock = (d: Date) => d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const day = (d: Date) => d.toLocaleDateString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

function reportedText(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const yesterday = new Date(now.getTime() - 86_400_000);
  const when = day(at) === day(now) ? clock(at)
    : day(at) === day(yesterday) ? `igår ${clock(at)}`
    : `${at.toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: TZ })} ${clock(at)}`;
  return `Bilen rapporterade ${when}`;
}

function pillFor(d: SkodaData): SkodaView["pill"] {
  if (d.doorsOpen) return { text: "Dörr öppen", tone: "bad" };
  if (d.trunkOpen) return { text: "Bagagelucka öppen", tone: "bad" };
  if (d.windowsOpen) return { text: "Fönster öppet", tone: "bad" };
  if (d.bonnetOpen) return { text: "Motorhuv öppen", tone: "bad" };
  if (d.locked === false) return { text: "Olåst", tone: "warn" };
  if (d.charging) return { text: "Laddar", tone: "ok" };
  if (d.locked) return { text: "Låst", tone: "ok" };
  return { text: "Okänt läge" };
}

function openCheck(label: string, open: boolean | null, openText: string, closedText: string): SkodaCheck | null {
  if (open === null) return null;
  return open ? { label, value: openText, tone: "bad" } : { label, value: closedText, tone: "ok" };
}

/** Bestämmer allt Škoda-kortet visar. Ren funktion: kortet ritar bara upp resultatet. */
export function skodaView(d: SkodaData, now: Date): SkodaView {
  let chargeLine: string | null = null;
  if (d.charging) {
    // "Laddar" står redan i pillret och blixten visar laddning; mellanslag före enheter är hårda så att "80 %" inte bryts.
    const parts: string[] = [];
    if (d.chargeKw) parts.push(`${String(Math.round(d.chargeKw * 10) / 10).replace(".", ",")}\u00a0kW`);
    if (d.chargeMinutesLeft) parts.push(`klar ca\u00a0${clock(new Date(now.getTime() + d.chargeMinutesLeft * 60_000))}`);
    if (d.chargeTargetPct !== null) parts.push(`mål\u00a0${d.chargeTargetPct}\u00a0%`);
    chargeLine = parts.length ? parts.join(" · ") : "Laddar";
  }

  const checks = [
    d.locked === null ? null : d.locked ? { label: "Lås", value: "Låst", tone: "ok" as const } : { label: "Lås", value: "Olåst", tone: "warn" as const },
    openCheck("Dörrar", d.doorsOpen, "Öppen", "Stängda"),
    openCheck("Fönster", d.windowsOpen, "Öppet", "Stängda"),
    openCheck("Bagage", d.trunkOpen, "Öppen", "Stängd"),
    d.bonnetOpen ? openCheck("Motorhuv", true, "Öppen", "Stängd") : null,
  ].filter((c): c is SkodaCheck => c !== null);

  return {
    pill: pillFor(d),
    levelText: d.levelPct === null ? null : `${d.levelPct} % ${d.levelKind === "battery" ? "batteri" : "tank"}`,
    chargeLine,
    targetPct: d.charging ? d.chargeTargetPct : null,
    checks,
    place: d.parked ?? "Plats okänd",
    reported: reportedText(d.capturedAt, now),
  };
}
