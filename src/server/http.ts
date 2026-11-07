import "server-only";
import { getEnv } from "@/lib/env";

/** Intern adress -> absolut adress mot den publika basadressen (bakom Render är req.url en intern adress). */
export function publicUrl(path: string): URL {
  return new URL(path, getEnv().BETTER_AUTH_URL);
}

export const stateCookieName = (id: string) => `oauth_state_${id}`;

export function stateCookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: getEnv().BETTER_AUTH_URL.startsWith("https://"), path: "/api/connect", maxAge };
}
