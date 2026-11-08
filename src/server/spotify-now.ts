import "server-only";
import { safeSummary } from "./providers/safe";
import type { CardState, Provider } from "./providers/types";

/**
 * Spotifys läge direkt från Spotify, utan hemskärmens cache, så att kortet kan uppdateras med några sekunders mellanrum.
 * Ett enda anrop mot Spotify per fråga (två om inget är aktivt och senast spelat hämtas).
 */
export async function handleSpotifyNow(req: { userId: string | null }, deps: { provider?: Provider<unknown> } = {}): Promise<{ status: number; json: { state: CardState<unknown> } | { error: string } }> {
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  const provider = deps.provider ?? (await import("./providers")).PROVIDERS.find((p) => p.id === "spotify");
  if (!provider) return { status: 404, json: { error: "Spotify saknas" } };
  return { status: 200, json: { state: await safeSummary(provider) } };
}
