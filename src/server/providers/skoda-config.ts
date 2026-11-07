import type { Env } from "@/lib/env";
import type { SkodaBridgeConfig } from "./skoda";

/**
 * Škoda-bryggan ligger som standard i samma Vercel-projekt (api/skoda.py), alltså på appens egen adress.
 * SKODA_BRIDGE_URL används bara om bryggan körs någon annanstans (egen värd eller lokalt).
 * Utan SKODA_BRIDGE_TOKEN räknas Škoda som ej ansluten.
 */
export function skodaConfigFromEnv(env: Pick<Env, "BETTER_AUTH_URL"> & Partial<Pick<Env, "SKODA_BRIDGE_URL" | "SKODA_BRIDGE_TOKEN">>): SkodaBridgeConfig | null {
  if (!env.SKODA_BRIDGE_TOKEN) return null;
  return { url: env.SKODA_BRIDGE_URL ?? env.BETTER_AUTH_URL, token: env.SKODA_BRIDGE_TOKEN };
}
