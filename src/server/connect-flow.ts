import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildAuthorizeUrl, exchangeCode, newState, statesMatch, type OAuthConfig } from "@/lib/oauth";
import { saveTokens } from "./connections";
import { getOAuthConfig, type OAuthProviderId } from "./oauth-providers";

const back = (id: OAuthProviderId, result: string) => `/installningar?tjanst=${id}&${result}`;

export function startConnect(id: OAuthProviderId, config: OAuthConfig | null = getOAuthConfig(id)): { redirectTo: string; state: string } | { error: "saknar-konfiguration" } {
  if (!config) return { error: "saknar-konfiguration" };
  const state = newState();
  return { redirectTo: buildAuthorizeUrl(config, state), state };
}

export interface FinishDeps {
  config?: OAuthConfig | null;
  fetchFn?: typeof fetch;
  db?: PrismaClient;
}

/**
 * Tar emot återkomsten från tjänsten. State kontrolleras mot cookien FÖRST: utan matchning görs inget anrop.
 * Returnerar alltid en intern adress att skicka användaren till.
 */
export async function finishConnect(
  id: OAuthProviderId,
  query: { code?: string; state?: string; error?: string },
  cookieState: string | undefined,
  userId: string,
  deps: FinishDeps = {},
): Promise<{ redirectTo: string }> {
  if (!statesMatch(query.state, cookieState)) return { redirectTo: back(id, "fel=ogiltig-state") };
  if (query.error) return { redirectTo: back(id, "fel=avbrutet") };
  if (!query.code) return { redirectTo: back(id, "fel=saknar-kod") };
  const config = deps.config === undefined ? getOAuthConfig(id) : deps.config;
  if (!config) return { redirectTo: back(id, "fel=saknar-konfiguration") };
  try {
    const tokens = await exchangeCode(config, query.code, deps.fetchFn);
    await saveTokens(userId, id, tokens, deps.db);
  } catch {
    // Detaljer (som kan innehålla tjänstens svar) visas aldrig för användaren och loggas inte.
    return { redirectTo: back(id, "fel=misslyckades") };
  }
  return { redirectTo: back(id, "ok=1") };
}

/** Skydd mot att andra sajter kopplar från via användarens cookie: Origin måste vara samma värd som anropet. */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
