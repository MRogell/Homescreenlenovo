// Kör databasmigreringar som en del av bygget på Vercel (endast Production), så att schemat alltid följer koden.
// Hoppar över: Preview-bygge (får aldrig röra produktionsdatabasen) och bygge utan databasadress (t.ex. lokalt utan databas).
// MIGRATE_DATABASE_URL (direkt adress, utan pooler) har företräde framför DATABASE_URL: Prismas migreringar använder
// lås som inte fungerar via en pooler (Neon: adressen utan "-pooler", Vercels variabel DATABASE_URL_UNPOOLED).
import { execSync } from "node:child_process";

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
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
