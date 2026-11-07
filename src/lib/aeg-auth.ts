import { jwtExpiryMs } from "./aeg";
import { OAuthError, type TokenSet } from "./oauth";

// Electrolux Group utvecklar-API (officiella SDK:t electrolux-group-developer-sdk 0.7.0).
export const AEG_API = "https://api.developer.electrolux.one/api/v1";
const FALLBACK_LIFETIME_MS = 10 * 60_000;

/** Access-tokenets giltighet ur JWT:n, annars 10 minuter (då förnyas det snart igen). */
export function aegTokenSet(accessToken: string, refreshToken: string, nowMs: number): TokenSet {
  return { accessToken, refreshToken, expiresAt: jwtExpiryMs(accessToken) ?? nowMs + FALLBACK_LIFETIME_MS };
}

/** Refresh-token roteras. 400/401 betyder att anslutningen måste göras om. */
export async function refreshAegTokens(refreshToken: string, fetchFn: typeof fetch = fetch, nowMs: number = Date.now()): Promise<TokenSet> {
  const res = await fetchFn(`${AEG_API}/token/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }), cache: "no-store" });
  if (!res.ok) {
    const revoked = res.status === 400 || res.status === 401;
    throw new OAuthError(`AEG-förnyelse misslyckades (${res.status})`, res.status, revoked ? "invalid_grant" : undefined);
  }
  let json: { accessToken?: unknown; refreshToken?: unknown } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    // Hanteras nedan.
  }
  if (typeof json.accessToken !== "string" || typeof json.refreshToken !== "string") throw new OAuthError("Ogiltigt tokensvar från AEG", res.status);
  return aegTokenSet(json.accessToken, json.refreshToken, nowMs);
}
