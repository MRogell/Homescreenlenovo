/** Aktiviteter: val och texter som formuläret, servern och kalendersynken delar (samma val som i Veckiva). */
export const FREQUENCIES = ["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<Frequency, string> = { NONE: "Upprepas inte", DAILY: "Varje dag", WEEKLY: "Varje vecka", BIWEEKLY: "Varannan vecka", MONTHLY: "Varje månad" };
const RRULES: Record<Exclude<Frequency, "NONE">, string> = { DAILY: "FREQ=DAILY", WEEKLY: "FREQ=WEEKLY", BIWEEKLY: "FREQ=WEEKLY;INTERVAL=2", MONTHLY: "FREQ=MONTHLY" };

/** iCal-regeln (utan "RRULE:") för en upprepning. `until` är sista datumet (YYYY-MM-DD, inklusive). */
export function rruleFor(freq: Frequency, until?: string | null, allDay = true): string | null {
  if (freq === "NONE") return null;
  // Vanliga händelser kräver UNTIL som UTC-tid; slutet av dagen så att sista dagens tillfälle räknas med.
  return RRULES[freq] + (until ? `;UNTIL=${until.replace(/-/g, "")}${allDay ? "" : "T235959Z"}` : "");
}

export const VISIBILITIES = ["HOUSEHOLD", "PARTICIPANTS", "PRIVATE"] as const;
export const SHARE_LEVELS = ["BUSY_ONLY", "VIEW", "EDIT"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type ShareLevel = (typeof SHARE_LEVELS)[number];
export const VISIBILITY_LABEL: Record<Visibility, string> = { HOUSEHOLD: "Hela hushållet", PARTICIPANTS: "Bara deltagarna", PRIVATE: "Bara jag" };
export const SHARE_LEVEL_LABEL: Record<ShareLevel, string> = { BUSY_ONLY: "Visa bara att tiden är upptagen", VIEW: "Får se allt", EDIT: "Får se och ändra" };
export const VISIBILITY_HINT: Record<Visibility, string> = { HOUSEHOLD: "Alla med åtkomst till hushållet ser den.", PARTICIPANTS: "Du och deltagarna ser den.", PRIVATE: "Bara du ser den." };

export const MEMBER_KINDS = ["adult", "child"] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];
export const MEMBER_KIND_LABEL: Record<MemberKind, string> = { adult: "Vuxen", child: "Barn" };
export const MEMBER_COLORS = ["#4f8ef7", "#e0566b", "#3fae6e", "#a06be0", "#d9902f", "#2fa7b8"] as const;
export const MAX_MEMBERS = 12;
export interface FamilyMember { id: string; name: string; kind: MemberKind }

/** Det som sparas om en aktivitet utöver det kalendern själv kan: vilka som deltar, packlista m.m. */
export interface ActivityMeta {
  participants: string[];
  responsible?: string;
  bring: string[];
  away: boolean;
  visibility: Visibility;
  shareLevel: ShareLevel;
}

/** "Att ta med": en punkt per rad, tomma rader bort, dubbletter (oavsett versaler) hopslagna. */
export function parseBring(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map((x) => x.trim().slice(0, 60)).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 20);
}

/** Texten som skrivs i kalenderns beskrivning så att deltagare och packlista syns även i Google och iPhone-kalendern. */
export function describe(notes: string, bring: string[], who: string[], responsible?: string): string {
  const parts: string[] = [];
  if (notes.trim()) parts.push(notes.trim());
  if (who.length) parts.push(`Deltagare: ${who.join(", ")}${responsible ? ` (ansvarig: ${responsible})` : ""}`);
  if (bring.length) parts.push(`Att ta med:\n${bring.map((b) => `- ${b}`).join("\n")}`);
  return parts.join("\n\n");
}

/** Nyckel för en händelses extrauppgifter. Återkommande Google-förekomster heter `<id>_<tid>`: serien delar uppgifter. */
export const metaKey = (calendarId: string, eventId: string) => `${calendarId}|${eventId.split("_")[0]}`;

/** När barnen byter hushåll (bara för texten "Nästa växling"). Veckodag 1–7 (mån–sön). */
export interface Handover { weekday: number; time: string }
export const DEFAULT_HANDOVER: Handover = { weekday: 7, time: "16:30" };
export const WEEKDAYS_SHORT = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"] as const;

/** Nästa växling efter nu: datum (YYYY-MM-DD), veckodag och klockslag. `today`/`minutes` är lokal dag och minuter sedan midnatt. */
export function nextHandover(today: string, minutes: number, h: Handover): { date: string; weekday: number; time: string } {
  const wd = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const [hh, mm] = h.time.split(":").map(Number) as [number, number];
  let diff = (h.weekday - wd(today) + 7) % 7;
  if (diff === 0 && minutes >= hh * 60 + mm) diff = 7;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diff);
  return { date: d.toISOString().slice(0, 10), weekday: h.weekday, time: h.time };
}
