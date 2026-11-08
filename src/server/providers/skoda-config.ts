import type { Env } from "@/lib/env";
import type { SkodaBridgeConfig } from "./skoda";

/**
 * Škoda-bryggan är ett eget Vercel-projekt (mappen skoda-bridge/, Python). Vercel bygger inte Python-funktioner i ett Next.js-projekt,
 * så bryggan kan aldrig ligga på appens egen adress. Både adress och token krävs; annars räknas Škoda som ej ansluten.
 */
export function skodaConfigFromEnv(env: Pick<Env, "BETTER_AUTH_URL"> & Partial<Pick<Env, "SKODA_BRIDGE_URL" | "SKODA_BRIDGE_TOKEN">>): SkodaBridgeConfig | null {
  if (!env.SKODA_BRIDGE_TOKEN || !env.SKODA_BRIDGE_URL) return null;
  return { url: env.SKODA_BRIDGE_URL, token: env.SKODA_BRIDGE_TOKEN };
}
