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
  // Hemlighet för servertimern som startar förvärm när ingen skärm är öppen (minst 16 tecken). Se docs/DRIFT.md.
  CRON_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  // Väder och luftkvalitet (Open-Meteo). Standard: Luleå.
  WEATHER_PLACE: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).max(60).default("Luleå")),
  WEATHER_LAT: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(-90).max(90).default(65.5848)),
  WEATHER_LON: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(-180).max(180).default(22.1547)),
  // Škoda-bryggan (skoda-bridge/, eget Vercel-projekt): adress och delad token (minst 32 tecken). Utan båda visas Škoda som ej ansluten.
  // SKODA_BRIDGE_URL är bryggans egen adress, t.ex. https://hemskarm-skoda.vercel.app.
  // Valideras i skoda-config.ts, inte här: ett fel i Škodas variabler får aldrig stoppa bygget eller resten av appen.
  SKODA_BRIDGE_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().optional()),
  SKODA_BRIDGE_TOKEN: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Valideras vid första användning (inte vid import) så att `next build` inte kräver hemligheter. */
export function getEnv(): Env {
  if (!cached) {
    // Vercels förhandsbygge (Preview) har ingen databasadress: den hör bara till Production, så att förhandsvisningar aldrig rör
    // produktionsdatabasen. Själva bygget behöver ingen databas, så bara under bygget fylls en platshållare i. Vid körning krävs adressen.
    const building = process.env.NEXT_PHASE === "phase-production-build" && !process.env.DATABASE_URL;
    const parsed = schema.safeParse(building ? { ...process.env, DATABASE_URL: "postgresql://bygge-utan-databas" } : process.env);
    if (!parsed.success) throw new Error(`Ogiltig miljökonfiguration: ${z.prettifyError(parsed.error)}`);
    // Lättnaden i inloggningens hastighetsgräns är bara till för automatiska tester: i Vercels Production gäller alltid grundgränsen.
    cached = process.env.VERCEL_ENV === "production" ? { ...parsed.data, AUTH_RATE_LIMIT_SCALE: 1 } : parsed.data;
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
