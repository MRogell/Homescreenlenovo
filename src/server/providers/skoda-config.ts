import type { Env } from "@/lib/env";
import type { SkodaBridgeConfig } from "./skoda";

type SkodaEnv = Pick<Env, "BETTER_AUTH_URL"> & Partial<Pick<Env, "SKODA_BRIDGE_URL" | "SKODA_BRIDGE_TOKEN">>;

const MIN_TOKEN = 32;

/**
 * Vad som saknas eller är fel i Škodas variabler, eller null om allt är på plats. Nämner bara variabelnamn, aldrig värden.
 * Felen stoppar inte appen: Škoda räknas då bara som ej ansluten.
 */
export function skodaConfigProblem(env: SkodaEnv): string | null {
  const problems: string[] = [];
  const url = env.SKODA_BRIDGE_URL;
  if (!url) problems.push("SKODA_BRIDGE_URL saknas");
  else if (!/^https?:\/\/[^/\s]+/.test(url)) problems.push("SKODA_BRIDGE_URL är ingen adress (ska börja med https://)");
  const token = env.SKODA_BRIDGE_TOKEN;
  if (!token) problems.push("SKODA_BRIDGE_TOKEN saknas");
  else if (token.length < MIN_TOKEN) problems.push(`SKODA_BRIDGE_TOKEN är kortare än ${MIN_TOKEN} tecken`);
  return problems.length ? problems.join(", ") : null;
}

/**
 * Škoda-bryggan är ett eget Vercel-projekt (mappen skoda-bridge/, Python). Vercel bygger inte Python-funktioner i ett Next.js-projekt,
 * så bryggan kan aldrig ligga på appens egen adress. Både adress och token krävs; annars räknas Škoda som ej ansluten.
 */
export function skodaConfigFromEnv(env: SkodaEnv): SkodaBridgeConfig | null {
  if (skodaConfigProblem(env) !== null) return null;
  return { url: env.SKODA_BRIDGE_URL!.replace(/\/api\/skoda\/?$/, "").replace(/\/+$/, ""), token: env.SKODA_BRIDGE_TOKEN! };
}
