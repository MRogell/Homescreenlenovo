# Hemskärm etapp 1 (grund) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En körbar, separat Next.js-app med inloggning, databas och en hemskärm som visar kort för åtta smarthemtjänster med demodata, bakom ett gränssnitt som riktiga integrationer byter in senare.

**Architecture:** Varje tjänst är en isolerad modul som returnerar `CardState`. En tjänst som kastar blir `unavailable`/`stale` och påverkar aldrig övriga. Servern cachar senaste `Snapshot` per tjänst med TTL; klienten pollar `/api/home`.

**Tech Stack:** Next.js 16 (App Router, TS strict), Tailwind 4, Prisma 7 + PostgreSQL (`@prisma/adapter-pg`), Better Auth, Zod, Vitest. Versioner som i Veckivas `package.json`.

**Spec:** `docs/superpowers/specs/2026-11-07-etapp-1-grund-design.md`

## Global Constraints
- Helt separat från Veckiva: ingen kod, import eller databas delas.
- Next.js 16 har brytande ändringar: läs `node_modules/next/dist/docs/` innan Next-kod skrivs.
- TS `strict` + `noUncheckedIndexedAccess`.
- Tokens lagras AES-256-GCM-krypterade; aldrig i git eller i API-svar.
- Databas: Render PostgreSQL; externa anslutningar `?sslmode=require` sist i `DATABASE_URL`; migreringar via `npx prisma migrate deploy`. Gratisdatabasen på Render går ut efter 30 dagar.
- Testdatabasnamn måste innehålla `test` (`homescreen_test`).
- Svenska i gränssnitt och dokumentation. Tryckytor minst 48 px, kontrast WCAG AA.
- Registrering stängs efter första kontot.
- Service worker cachar aldrig personuppgifter eller `/api`.

## Review Focus
1. Två samtidiga registreringar när inget konto finns: högst ett konto skapas.
2. En tjänstemodul som kastar ett icke-Error-värde (sträng/null): ger `unavailable`, kastar inte vidare.
3. Cachad payload som inte längre klarar Zod-schemat: ignoreras, inte kraschar sidan.
4. `/api/home` utan session: 401 och inga data; svaret innehåller aldrig token-fält.
5. Cache exakt på TTL-gränsen och framtida `fetchedAt` (klockskev): behandlas som färsk respektive utgången på ett förutsägbart sätt.

---

### Task 1: Projektgrund
**Files:** Create `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`, `.github/workflows/ci.yml`, `README.md`
**Interfaces:** Produces: `npm run typecheck|lint|test|build|dev`, alias `@/*` → `src/*`, vitest-alias `server-only` → `test/server-only-stub.ts`.
- [ ] **Step 1:** Skapa filerna med samma verktygsval och versioner som Veckiva (Next, Tailwind 4, Vitest 5, ESLint 9). `next.config.ts` har samma säkerhetsheaders som Veckiva.
- [ ] **Step 2:** Kör `npm install`, sedan `npm run typecheck && npm run lint`. Förväntat: inga fel.
- [ ] **Step 3:** Commit `chore: projektgrund`.

### Task 2: Databas och miljö
**Files:** Create `prisma/schema.prisma`, `prisma.config.ts`, `src/server/db.ts`, `src/lib/env.ts`, `test/global-setup.ts`, `test/test-env.ts`, `test/server-only-stub.ts`, `src/lib/env.test.ts`
**Interfaces:** Produces: `db: PrismaClient`; `getEnv(): { DATABASE_URL; BETTER_AUTH_SECRET; BETTER_AUTH_URL; AUTH_TRUSTED_ORIGINS?; AUTH_RATE_LIMIT_SCALE }`; modeller Better Auth-tabeller, `Connection {id,userId,provider,tokenEnc,status,lastSyncAt,lastError}` unik på `(userId, provider)`, `Snapshot {id,provider,payload Json,fetchedAt}` indexerad på `(provider, fetchedAt)`.
- [ ] **Step 1:** Test `getEnv rejects secret shorter than 32 chars` och `getEnv defaults AUTH_RATE_LIMIT_SCALE to 1`. Kör: FAIL.
- [ ] **Step 2:** Implementera `getEnv` med Zod. Skriv schema och första migrering (`npx prisma migrate dev --name init`). `global-setup` skapar `homescreen_test` och kör `migrate deploy`.
- [ ] **Step 3:** `npm test`. Förväntat: PASS. Commit.

### Task 3: Krypto
**Files:** Create `src/lib/crypto.ts`, `src/lib/crypto.test.ts`
**Interfaces:** Produces: `encryptToken(plain: string, secret: string): string`, `decryptToken(blob: string, secret: string): string`.
- [ ] **Step 1:** Tester: `roundtrip returns original`, `two encryptions of same text differ`, `tampered ciphertext throws`, `wrong secret throws`, `empty string roundtrips`. Kör: FAIL.
- [ ] **Step 2:** AES-256-GCM, nyckel via `scrypt`/HKDF från `secret`, slumpad 12-byte IV och auth-tag i `base64url`-blob. Kör: PASS. Commit.

### Task 4: Tjänstekontrakt och demomoduler
**Files:** Create `src/server/providers/types.ts`, `src/server/providers/demo.ts`, `src/server/providers/index.ts`, `src/server/providers/safe.ts`, `src/server/providers/safe.test.ts`, `src/server/providers/demo.test.ts`
**Interfaces:** Produces: `ProviderId = "skoda"|"sonos"|"spotify"|"plejd"|"tado"|"tapo"|"aeg"|"arlo"`; `CardState<T>` enligt spec; `Provider<T> { id; ttlSeconds; schema: z.ZodType<T>; getSummary(): Promise<T> }`; `PROVIDERS: Provider<unknown>[]` (åtta, demo); `safeSummary<T>(p: Provider<T>, last?: {data:T; fetchedAt:string}): Promise<CardState<T>>`.
- [ ] **Step 1:** Tester för `safeSummary`: `returns ok with data`, `returns stale with last data when provider throws`, `returns unavailable when throws and no last`, `handles non-Error throw (string, null)`, `invalid data from provider is treated as failure`. Test för demo: `every provider returns data valid for its own schema`, `PROVIDERS has exactly the eight ids`. Kör: FAIL.
- [ ] **Step 2:** Implementera. `not_connected` returneras när modulen markerats frånkopplad (Tapo i demo). Kör: PASS. Commit.

### Task 5: Cache (Snapshot)
**Files:** Create `src/server/snapshots.ts`, `src/server/snapshots.test.ts`
**Interfaces:** Consumes: `PROVIDERS`, `safeSummary`, `db`. Produces: `getHomeStates(now?: Date): Promise<Record<ProviderId, CardState<unknown>>>`.
- [ ] **Step 1:** Tester mot riktig databas: `fresh snapshot is served without calling provider`, `snapshot older than ttl triggers fetch and is stored`, `exactly at ttl boundary refetches`, `future fetchedAt (clock skew) refetches`, `stored payload failing schema is ignored`, `one failing provider does not affect others`. Kör: FAIL.
- [ ] **Step 2:** Implementera med parallella hämtningar (`Promise.all`) och skrivning av senaste `Snapshot` per tjänst. Kör: PASS. Commit.

### Task 6: Inloggning
**Files:** Create `src/server/auth.ts`, `src/server/authz.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/app/logga-in/page.tsx`, `src/components/login-form.tsx`, `src/proxy.ts`, `src/server/auth.test.ts`
**Interfaces:** Produces: `auth`, `requireUser(): Promise<{id:string; email:string}>` (redirect till `/logga-in`), `getSessionUser(headers): Promise<User|null>`, `countUsers()` används av `databaseHooks.user.create.before` som nekar när ett konto redan finns (atomiskt, i transaktion).
- [ ] **Step 1:** Tester: `first signup succeeds`, `second signup is rejected`, `concurrent signups create at most one user`, `getSessionUser returns null without cookie`. Kör: FAIL.
- [ ] **Step 2:** Better Auth som i Veckiva (e-post/lösenord, `minPasswordLength` 10, rate limit, 14 dagars session), ingen e-postverifiering (enanvändarapp). Spärren mot flera konton använder en advisory lock. Inloggningssida på svenska. Kör: PASS. Commit.

### Task 7: API och hemskärm
**Files:** Create `src/app/api/home/route.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/home/{home-screen,card-shell,clock,*-card}.tsx`, `src/components/ui/{pill,bar}.tsx`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/app/api/home/route.test.ts`
**Interfaces:** Consumes: `getHomeStates`, `getSessionUser`. Produces: `GET /api/home` → `{ states: Record<ProviderId, CardState>, now: string }` (401 utan session, `Cache-Control: no-store`); `formatMinutes(n: number): string`, `formatAgo(iso: string, now: Date): string`.
- [ ] **Step 1:** Tester: `GET /api/home without session is 401 with no body data`, `response never contains tokenEnc`, `formatAgo handles future timestamps as "just nu"`, `formatMinutes(62) is "1 h 2 min"`. Kör: FAIL.
- [ ] **Step 2:** Implementera route och sidor. Hemskärmen byggs efter förhandsvisningen (4 × 2 rutnät, mörkt läge, kort för ok/stale/unavailable/not_connected). Klienten pollar var 30:e sekund och pausar när fliken är dold. Kör: PASS. Commit.

### Task 8: PWA, inställningar, dokumentation, CI
**Files:** Create `src/app/manifest.ts`, `public/sw.js`, `public/icons/*`, `src/components/service-worker.tsx`, `src/app/(app)/installningar/page.tsx`, `docs/LOKALT.md`, `docs/DRIFT.md`, `.github/workflows/ci.yml`
- [ ] **Step 1:** Manifest (`display: standalone`, `orientation: landscape`), maskable-ikoner, service worker som bara cachar en allowlist av publika statiska filer och `/offline`.
- [ ] **Step 2:** Inställningar: anslutningslista (alla "Ej ansluten" i etapp 1), version och utloggning. `DRIFT.md` beskriver Render (webbtjänst + PostgreSQL, `?sslmode=require`, `migrate deploy`, gratisdatabasens 30 dagar, `pg_dump`).
- [ ] **Step 3:** Kör `npm run typecheck && npm run lint && npm test && npm run build`. Förväntat: allt grönt. Starta appen och verifiera inloggning och hemskärm med skärmbild. Commit och push.

## Self-review
- **Spec-täckning:** mål/avgränsning (T7), tjänstegränssnitt (T4), datamodell (T2), dataflöde/TTL (T5), hemskärm (T7), säkerhet (T3, T6, T7, T8), test (alla), leverans (T8). Android-wrapper ingår inte: spec gör den villkorad på ditt önskemål.
- **Typkonsistens:** `CardState`, `ProviderId`, `safeSummary` och `getHomeStates` används med samma namn och signatur i T4, T5 och T7.
