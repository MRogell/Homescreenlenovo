/** Kortens ordning på hemskärmen. Fungerande kort först; det som inte fungerar (än) ligger sist. */
export const CARD_ORDER = ["weather", "skoda", "spotify", "sonos", "aeg", "tado"] as const;
export type CardId = (typeof CARD_ORDER)[number];
