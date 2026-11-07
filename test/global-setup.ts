import { execSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "./test-env";

/** Skapar testdatabasen vid behov och kör ALLA migreringar på den (testar även migreringarna). */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Ogiltigt testdatabasnamn: ${name}`);
  if (!name.includes("test")) throw new Error("Testdatabasen måste ha 'test' i namnet");

  const admin = new Client({ connectionString: new URL("/postgres", url).toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } });
}
