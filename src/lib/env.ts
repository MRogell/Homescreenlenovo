import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET måste vara minst 32 tecken"),
  BETTER_AUTH_URL: z.url(),
  /** Extra adresser som får logga in, kommaseparerade. BETTER_AUTH_URL är alltid betrodd. */
  AUTH_TRUSTED_ORIGINS: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  /** Multiplicerar autentiseringens hastighetsgränser (endast för automatiska tester; standard 1). */
  AUTH_RATE_LIMIT_SCALE: z.coerce.number().int().min(1).max(100).default(1),
  // OAuth-appar (etapp 2). Saknas de visas "Saknar konfiguration" i Inställningar och inga anrop görs.
  SONOS_CLIENT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  SONOS_CLIENT_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  SPOTIFY_CLIENT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  SPOTIFY_CLIENT_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  // Tado (enhetskodsflöde, publik klient). Behöver normalt inte sättas.
  TADO_CLIENT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(8).optional()),
  // Väder och luftkvalitet (Open-Meteo). Standard: Luleå.
  WEATHER_PLACE: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).max(60).default("Luleå")),
  WEATHER_LAT: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(-90).max(90).default(65.5848)),
  WEATHER_LON: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(-180).max(180).default(22.1547)),
  // Škoda-bryggan (api/skoda.py i samma projekt): delad token (minst 32 tecken). Utan token visas Škoda som ej ansluten.
  // SKODA_BRIDGE_URL behövs bara om bryggan körs på annan adress än appen.
  SKODA_BRIDGE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  SKODA_BRIDGE_TOKEN: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32, "SKODA_BRIDGE_TOKEN måste vara minst 32 tecken").optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Valideras vid första användning (inte vid import) så att `next build` inte kräver hemligheter. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) throw new Error(`Ogiltig miljökonfiguration: ${z.prettifyError(parsed.error)}`);
    cached = parsed.data;
  }
  return cached;
}

/** Endast för tester: tvingar fram ny validering av process.env. */
export function resetEnvCache() {
  cached = undefined;
}

/** Läser env utan cache (testbar). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new Error(`Ogiltig miljökonfiguration: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
