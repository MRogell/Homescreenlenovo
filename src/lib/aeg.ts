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
