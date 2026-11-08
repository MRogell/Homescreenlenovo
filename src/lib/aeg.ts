const STATE_TEXT: Record<string, string> = {
  OFF: "Av",
  IDLE: "Väntar",
  RUNNING: "Pågår",
  PAUSED: "Pausad",
  READY_TO_START: "Redo att starta",
  DELAYED_START: "Startar senare",
  END_OF_CYCLE: "Klar",
};

/** Electrolux `applianceState` till svensk text. */
export function aegStateText(state: string): string {
  return STATE_TEXT[state] ?? "Okänt läge";
}

/** "AUTO_SENSE" -> "Auto sense". */
export function programName(uid: string | undefined | null): string | null {
  if (!uid) return null;
  const words = uid.toLowerCase().replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : null;
}

const PROGRAM_ID = /^[A-Za-z0-9_]{1,64}$/;

/** Programmen maskinen själv säger att den stöder (`/info` → capabilities), utan avstängda. Trasigt svar ger tom lista. */
export function parsePrograms(info: unknown): string[] {
  const caps = (info as { capabilities?: unknown } | null)?.capabilities;
  const entry = (caps && typeof caps === "object" ? (caps as Record<string, unknown>)["userSelections/programUID"] : undefined) as { values?: unknown } | undefined;
  const values = entry?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return [];
  return Object.entries(values as Record<string, unknown>)
    .filter(([id, meta]) => PROGRAM_ID.test(id) && !(meta && typeof meta === "object" && (meta as { disabled?: unknown }).disabled === true))
    .map(([id]) => id);
}

const WORDS: Record<string, string> = {
  quick: "snabb", intensive: "intensiv", glass: "glas", care: "skötsel", rinse: "skölj", pre: "för", night: "natt",
  hygiene: "hygien", silent: "tyst", delicate: "skonsam", half: "halv", load: "last", daily: "dagligt", normal: "normal",
};

/** "QUICK_30" -> "Snabb 30", "ECO" -> "Eco". Okända ord lämnas som de är, så en ny maskin aldrig får tom text. */
export function programLabel(uid: string | undefined | null): string | null {
  if (!uid) return null;
  const words = uid.toLowerCase().split("_").filter(Boolean).map((w) => WORDS[w] ?? w).join(" ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : null;
}

/** Utgångstid (ms) ur en JWT:s `exp`, utan att verifiera signaturen. Null om den inte går att läsa. */
export function jwtExpiryMs(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const exp = (JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}
