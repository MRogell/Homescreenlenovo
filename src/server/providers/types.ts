import type { z } from "zod";

export const PROVIDER_IDS = ["skoda", "sonos", "spotify", "aeg", "arlo", "weather"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type CardState<T> =
  | { status: "ok"; data: T; fetchedAt: string }
  | { status: "stale"; data: T; fetchedAt: string; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "not_connected" };

export interface Provider<T> {
  id: ProviderId;
  /** Hur länge en hämtad snapshot räknas som färsk. */
  ttlSeconds: number;
  /** Längsta väntetid på getSummary innan tjänsten räknas som otillgänglig (standard 10 s). */
  timeoutMs?: number;
  /** Sätts till false när tjänsten inte är ansluten. */
  connected?: boolean;
  /** För tjänster med OAuth: sant först när en fungerande anslutning finns. */
  isConnected?: () => Promise<boolean>;
  /** Visas i Inställningar för tjänster som inte kräver anslutning (t.ex. öppna data). */
  sourceLabel?: string;
  schema: z.ZodType<T>;
  getSummary(): Promise<T>;
}
