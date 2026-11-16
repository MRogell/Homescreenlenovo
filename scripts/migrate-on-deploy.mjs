// Kör databasmigreringar som en del av bygget på Vercel (endast Production), så att schemat alltid följer koden.
// Hoppar över: Preview-bygge (får aldrig röra produktionsdatabasen) och bygge utan databasadress (t.ex. lokalt utan databas).
// MIGRATE_DATABASE_URL (direkt adress, utan pooler) har företräde framför DATABASE_URL: Prismas migreringar använder
// lås som inte fungerar via en pooler (Neon: adressen utan "-pooler", Vercels variabel DATABASE_URL_UNPOOLED).
import { spawnSync } from "node:child_process";

const onVercel = Boolean(process.env.VERCEL);
if (onVercel && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Hoppar över (VERCEL_ENV=${process.env.VERCEL_ENV}): migreringar körs bara i Production.`);
  process.exit(0);
}
const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] Hoppar över: varken MIGRATE_DATABASE_URL eller DATABASE_URL finns.");
  process.exit(0);
}
if (onVercel && !/sslmode=require/.test(url) && !/localhost|127\.0\.0\.1/.test(url)) {
  console.error("[migrate] Databasadressen saknar ?sslmode=require. Externa anslutningar kräver SSL.");
  process.exit(1);
}
if (onVercel && /-pooler\./.test(url)) {
  console.error("[migrate] Adressen går via en pooler (-pooler). Sätt MIGRATE_DATABASE_URL till den direkta adressen (Neon: DATABASE_URL_UNPOOLED).");
  process.exit(1);
}
console.log(`[migrate] Kör prisma migrate deploy (${process.env.MIGRATE_DATABASE_URL ? "MIGRATE_DATABASE_URL" : "DATABASE_URL"})…`);
// Databasen kan svara långsamt eller tillfälligt vara spärrad (t.ex. gratisgränsen nådd). Tre försök med paus innan bygget går vidare eller ger upp.
// Går databasen inte att nå alls hoppas migreringen över med en tydlig varning: koden ska ändå kunna läggas ut, och migreringen körs vid nästa bygge
// när databasen svarar. Alla andra fel (en riktig migrering som kraschar) stoppar bygget som förut.
const WAITS_MS = [0, 8_000, 20_000];
const UNREACHABLE = /P1001|P1002|P1017|Can't reach database server|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timed out|Server has closed the connection/i;
let lastOutput = "";
for (let i = 0; i < WAITS_MS.length; i++) {
  if (WAITS_MS[i]) {
    console.log(`[migrate] Försöker igen om ${WAITS_MS[i] / 1000} s (försök ${i + 1} av ${WAITS_MS.length})…`);
    await new Promise((r) => setTimeout(r, WAITS_MS[i]));
  }
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: url } });
  lastOutput = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  if (r.status === 0) process.exit(0);
  if (!UNREACHABLE.test(lastOutput)) {
    console.error("[migrate] Migreringen misslyckades (inte ett anslutningsfel). Bygget stoppas.");
    process.exit(1);
  }
}
console.warn("[migrate] VARNING: databasen går inte att nå (spärrad, pausad eller nere). Migreringen hoppas över; bygget fortsätter. Kontrollera databasen och bygg om när den svarar.");
process.exit(0);
