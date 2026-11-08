/** Kortens ordning på hemskärmen. Fungerande kort först; det som inte fungerar (än) ligger sist. */
export const CARD_ORDER = ["weather", "spotify", "sonos", "aeg", "tado", "arlo", "skoda"] as const;
export type CardId = (typeof CARD_ORDER)[number];
