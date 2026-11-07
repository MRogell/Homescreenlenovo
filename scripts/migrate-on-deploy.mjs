// Kör databasmigreringar som en del av bygget på Vercel (endast Production), så att schemat alltid följer koden.
// Hoppar över: Preview-bygge (får aldrig röra produktionsdatabasen) och bygge utan DATABASE_URL (t.ex. lokalt utan databas).
import { execSync } from "node:child_process";

const onVercel = Boolean(process.env.VERCEL);
if (onVercel && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Hoppar över (VERCEL_ENV=${process.env.VERCEL_ENV}): migreringar körs bara i Production.`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.log("[migrate] Hoppar över: DATABASE_URL saknas.");
  process.exit(0);
}
if (onVercel && !/sslmode=require/.test(process.env.DATABASE_URL) && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) {
  console.error("[migrate] DATABASE_URL saknar ?sslmode=require. Externa anslutningar till Render kräver SSL.");
  process.exit(1);
}
console.log("[migrate] Kör prisma migrate deploy…");
execSync("npx prisma migrate deploy", { stdio: "inherit" });
