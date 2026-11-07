import "server-only";
import { getEnv } from "@/lib/env";
import type { OAuthConfig } from "@/lib/oauth";

export const OAUTH_PROVIDERS = ["sonos", "spotify"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(s: string): s is OAuthProviderId {
  return (OAUTH_PROVIDERS as readonly string[]).includes(s);
}

export function redirectUriFor(id: OAuthProviderId): string {
  return `${getEnv().BETTER_AUTH_URL.replace(/\/$/, "")}/api/connect/${id}/callback`;
}

/** Null när klient-id eller hemlighet saknas: då görs inga anrop och Inställningar visar "Saknar konfiguration". */
export function getOAuthConfig(id: OAuthProviderId): OAuthConfig | null {
  const env = getEnv();
  const redirectUri = redirectUriFor(id);
  if (id === "sonos") {
    if (!env.SONOS_CLIENT_ID || !env.SONOS_CLIENT_SECRET) return null;
    return { authorizeUrl: "https://api.sonos.com/login/v3/oauth", tokenUrl: "https://api.sonos.com/login/v3/oauth/access", clientId: env.SONOS_CLIENT_ID, clientSecret: env.SONOS_CLIENT_SECRET, scope: "playback-control-all", redirectUri };
  }
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  return { authorizeUrl: "https://accounts.spotify.com/authorize", tokenUrl: "https://accounts.spotify.com/api/token", clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, scope: "user-read-playback-state user-modify-playback-state user-read-recently-played", redirectUri };
}
