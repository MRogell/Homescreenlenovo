# Hemskärm – etapp 1: grund (design)

Status: utkast för granskning. Ingen kod är skriven.

## Mål
En egen webbapp/PWA som visar live-data från familjens smarthemtjänster som en snygg, modern hemskärm på en **Lenovo P12** (12,7", 16:10, liggande, Android). Appen är **helt separat från Veckiva**: egen repo, egen databas, eget konto. Veckiva används bara som tekniskt mönster.

Tjänster på sikt: Škoda, Sonos, Plejd, Tado, Spotify, Tapo, AEG, Arlo.

## Avgränsning
**Ingår i etapp 1:** repo-grund, inloggning, databas, tjänstegränssnitt, hemskärm med kort per tjänst som visar **demodata**, PWA, CI.
**Ingår inte:** riktiga anslutningar till någon tjänst (etapp 2–4), styrning (play/pause, släcka lampor), flera hushåll, push-notiser.
Vyn är skrivskyddad. Styrning kan komma senare.

## Etapper
1. Grund (denna spec).
2. Sonos och Spotify (officiella API:er, OAuth).
3. Tado, Škoda, Arlo.
4. AEG, Plejd, Tapo (mest krångligt och minst stabilt).
Varje etapp får egen spec, plan och leverans.

## Teknik (samma stack som Veckiva)
Next.js 16 (App Router, TS strict, `noUncheckedIndexedAccess`) · Tailwind 4 · Prisma 7 + PostgreSQL (`@prisma/adapter-pg`) · Better Auth · Zod · Vitest · PWA (manifest, service worker som bara cachar publika statiska filer) · GitHub Actions med PostgreSQL 16.

Läs `node_modules/next/dist/docs/` innan Next.js-kod skrivs: versionen har brytande ändringar.

### Databas: Render (projektregel)
Render PostgreSQL är förstahandsval. Gratisdatabasen går ut 30 dagar efter att den skapats och raderas efter 14 dagars frist. För data som ska bevaras krävs betald plan eller regelbunden `pg_dump`. Externa anslutningar kräver `?sslmode=require` sist i `DATABASE_URL`. Migreringar körs med `npx prisma migrate deploy`.

## Mappar
- `prisma/` schema och migreringar.
- `src/app/` routes: `/logga-in`, `/` (hemskärmen), `/installningar`.
- `src/server/` endast serverkod: `db.ts`, `auth.ts`, `providers/` (en modul per tjänst), `snapshots.ts`.
- `src/lib/` ren delad logik: `env.ts`, `crypto.ts` (AES-256-GCM), formatering.
- `src/components/` UI: `ui/` (kort, märke, ikoner) och `home/` (ett kort per tjänst).

## Tjänstegränssnitt
Varje tjänst är en isolerad modul med samma kontrakt:

```ts
interface Provider<T> {
  id: ProviderId;                       // "skoda" | "sonos" | ...
  getSummary(ctx: ProviderCtx): Promise<T>;  // hämtar och normaliserar
  schema: z.ZodType<T>;                 // validerar svaret
}
type CardState<T> =
  | { status: "ok"; data: T; fetchedAt: string }
  | { status: "stale"; data: T; fetchedAt: string; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "not_connected" };
```

Fel i en tjänst fångas i sin modul och blir `stale` (senaste kända data) eller `unavailable`. Ett fel får aldrig påverka övriga kort. I etapp 1 returnerar alla moduler demodata (`demo.ts`) bakom samma kontrakt, så att riktiga anslutningar byts in utan ändring av gränssnittet.

## Datamodell
- Better Auth-tabeller (`User`, `Session`, `Account`, `Verification`).
- `Connection`: `provider`, krypterade tokens (`tokenEnc`), `status`, `lastSyncAt`, `lastError`. Unik på `(userId, provider)`.
- `Snapshot`: `provider`, `payload` (JSON, validerad med Zod), `fetchedAt`. Senaste raden per tjänst används som cache.

## Dataflöde
Plattan pratar bara med den egna servern. Servern hämtar från tjänsterna med kort TTL per tjänst (till exempel Sonos 15 s, Škoda 5 min) och sparar `Snapshot`. Klienten pollar `/api/home` var 30:e sekund och visar `fetchedAt` per kort. Ingen bakgrundskö i etapp 1: uppdatering sker vid förfrågan om cachen är äldre än TTL.

## Hemskärmen
- Liggande P12, mörkt läge som förval, ljust via systeminställning.
- Rutnät med 4 × 2 kort, ett per tjänst, med stora siffror och tydlig status. Inga menyer.
- Klocka, datum och hälsning överst.
- Kortinnehåll: Škoda (räckvidd/batteri, låst, parkerad), Sonos (spelas nu, rum), Spotify (senast spelat/pågående), Plejd (tända lampor), Tado (temperatur per rum), Tapo (uttag/kameror online), AEG (apparatens status och tid kvar), Arlo (kameror, senaste rörelse).
- Kort utan anslutning visar "Anslut" och länk till inställningar. Kort med problem visar tydligt "Ej tillgänglig" och när data senast var färsk.
- Tillgänglighet: kontrast WCAG AA, tryckytor minst 48 px, stöd för 200 % text utan överflöd.

## Säkerhet
- Alla tokens krypteras med AES-256-GCM (`lib/crypto.ts`), nyckel från `BETTER_AUTH_SECRET`-härledd hemlighet i miljövariabel. Aldrig i git.
- `requireUser()` på alla sidor och API-routes. Registrering är avstängd efter första kontot (egen familj).
- Säkerhetsheaders som i Veckiva. Service worker cachar aldrig personuppgifter.
- Inofficiella API:er (etapp 3–4) dokumenteras som sådana och kan sluta fungera.

## Test
- Enhetstester: krypto, Zod-scheman, tillståndslogik per kort.
- Integrationstester mot riktig PostgreSQL (`homescreen_test` skapas av `global-setup`).
- Ett test per tjänstemodul som visar att fel blir `stale`/`unavailable` och inte kastar.
- CI: typecheck, lint, test.

## Levereras i etapp 1
Repo med körbar app, hemskärm med demodata för alla åtta tjänster, inloggning, Render-databas och migreringar, PWA, CI, och `docs/` med lokal körning och driftsättning.

## Antaganden att bekräfta
- Plattan öppnar appen i webbläsare/PWA mot en publik https-adress (Render webbtjänst). Android-wrapper (TWA) görs bara om du vill.
- Ett konto och ett hushåll räcker.
- Skrivskyddat i första versionen.
