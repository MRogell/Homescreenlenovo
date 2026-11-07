# Hemskärm etapp 2 (Sonos och Spotify) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sonos- och Spotify-korten visar riktig data efter OAuth-anslutning i Inställningar.

**Architecture:** Ren OAuth-modul (`lib/oauth.ts`) med injicerbar `fetch`; `server/connections.ts` äger krypterad tokenlagring och förnyelse; providermodulerna tar `getToken` och `fetchFn` som beroenden; tunna route handlers anropar `server/connect-flow.ts`.

**Tech Stack:** som etapp 1. Inga nya beroenden.

**Spec:** `docs/superpowers/specs/2026-11-07-etapp-2-sonos-spotify-design.md`

## Global Constraints
- Hemligheter och tokens loggas aldrig och finns aldrig i felmeddelanden eller API-svar.
- Redirect-URI `${BETTER_AUTH_URL}/api/connect/<tjänst>/callback`; Spotify kräver https eller `127.0.0.1`.
- Access-token förnyas när < 60 s återstår; en förnyelse åt gången per tjänst.
- Sonos TTL 15 s, Spotify TTL 30 s. Sonos scope `playback-control-all`; Spotify scope `user-read-playback-state user-read-recently-played`.
- Svenska i gränssnittet. Skrivskyddat.

## Review Focus
1. Callback med saknad/felaktig `state` eller utan cookie: avvisas utan tokenanrop.
2. Tjänsten svarar med tom/oväntad JSON (inget `item`, tom grupplista, `null`): kort blir `stale`/`unavailable`, kraschar inte.
3. Förnyelse ger ingen ny `refresh_token`: den gamla behålls.
4. Samtidiga anrop med utgången token: exakt en förnyelse.
5. Koppla från med annan `Origin`: nekas.

---

### Task 1: OAuth-modul
**Files:** Create `src/lib/oauth.ts`, `src/lib/oauth.test.ts`
**Interfaces:** Produces: `OAuthConfig {authorizeUrl; tokenUrl; clientId; clientSecret; scope; redirectUri}`, `TokenSet {accessToken; refreshToken; expiresAt: number}`, `newState(): string`, `buildAuthorizeUrl(cfg, state): string`, `exchangeCode(cfg, code, fetchFn?, nowMs?): Promise<TokenSet>`, `refreshTokens(cfg, refreshToken, fetchFn?, nowMs?): Promise<TokenSet>`, `class OAuthError extends Error {status:number; code?:string}`, `statesMatch(a?: string, b?: string): boolean`.
- [ ] **Step 1:** Tester: `buildAuthorizeUrl contains client_id, scope, redirect_uri, state, response_type=code`; `exchangeCode posts form body with Basic auth`; `exchangeCode computes expiresAt from expires_in`; `refreshTokens keeps old refresh token when response has none`; `refreshTokens uses new refresh token when present`; `error response throws OAuthError with code and without secret in message`; `statesMatch rejects undefined, empty and different strings`. Kör: FAIL.
- [ ] **Step 2:** Implementera (form-urlencoded POST, `Authorization: Basic base64(id:secret)`, `crypto.timingSafeEqual` i `statesMatch`). Kör: PASS. Commit.

### Task 2: Miljö och tokenlagring
**Files:** Modify `src/lib/env.ts` (valfria `SONOS_*`, `SPOTIFY_*`), `.env.example`; Create `src/server/oauth-providers.ts`, `src/server/connections.ts`, `src/server/connections.test.ts`
**Interfaces:** Consumes: Task 1, `encryptToken/decryptToken`. Produces: `type OAuthProviderId = "sonos"|"spotify"`; `isOAuthProvider(s: string): s is OAuthProviderId`; `getOAuthConfig(id): OAuthConfig | null`; `saveTokens(userId, id, tokens, db?)`; `getAccessToken(id, deps?: {db?; fetchFn?; nowMs?}): Promise<string>`; `getConnectionStatus(id, db?): "ok"|"reauth"|"none"`; `deleteConnection(id, db?)`; `class ReauthRequired extends Error`.
- [ ] **Step 1:** Tester mot databasen: `saveTokens stores ciphertext, not plaintext`; `getAccessToken returns stored token when valid`; `refreshes when under 60 s left and saves the new set`; `concurrent calls cause exactly one refresh`; `invalid_grant marks reauth and throws ReauthRequired`; `deleteConnection removes connection and snapshots`; `getConnectionStatus returns none/ok/reauth`. Kör: FAIL.
- [ ] **Step 2:** Implementera; förnyelse serialiseras med en `Map<id, Promise>` per process. Kör: PASS. Commit.

### Task 3: Spotify- och Sonos-moduler
**Files:** Modify `src/server/providers/types.ts` (`isConnected?(): Promise<boolean>`), `schemas.ts`, `safe.ts`, `snapshots.ts`, `demo.ts` (ta bort sonos/spotify), `index.ts`; Create `src/server/providers/spotify.ts`, `sonos.ts` och tester.
**Interfaces:** Produces: `createSpotifyProvider(deps: {getToken: () => Promise<string>; fetchFn?: typeof fetch; isConnected?: () => Promise<boolean>}): Provider<SpotifyData>`; samma form för `createSonosProvider`; `SpotifyData {playing; title; artist; device: string|null; lastPlayedAt: string|null}`; `SonosData {playing; title; artist; room; grouped: string[]; volume; progressPct}`.
- [ ] **Step 1:** Spotify-tester: `200 playing`, `200 paused`, `204 falls back to recently-played`, `204 and empty history gives title "Inget spelas"`, `podcast episode uses show name`, `ad shows "Reklam"`, `401 throws`, `429 throws with retry hint`, `item null does not crash`. Sonos-tester: `picks playing group`, `falls back to first group`, `grouped lists other players`, `progressPct from position/duration, 0 when duration missing`, `no households throws`, `empty groups throws`, `401 throws`, `missing currentItem gives "Inget spelas"`. `safeSummary`/`snapshots`: `isConnected false gives not_connected without calling provider`. Kör: FAIL.
- [ ] **Step 2:** Implementera. Registret skapar de riktiga modulerna med `getAccessToken` och `getConnectionStatus`. Kör: PASS. Commit.

### Task 4: Anslutningsflöde och routes
**Files:** Create `src/server/connect-flow.ts`, `src/server/connect-flow.test.ts`, `src/app/api/connect/[provider]/route.ts`, `src/app/api/connect/[provider]/callback/route.ts`, `src/app/api/disconnect/[provider]/route.ts`
**Interfaces:** Produces: `startConnect(id): {redirectTo: string; state: string} | {error: "saknar-konfiguration"}`; `finishConnect(id, query: {code?; state?; error?}, cookieState: string|undefined, userId, deps?): Promise<{redirectTo: string}>`; `sameOrigin(origin: string|null, host: string|null): boolean`.
- [ ] **Step 1:** Tester: `missing state is rejected without token call`, `mismatching state is rejected`, `missing cookie is rejected`, `error param from provider redirects with fel`, `valid callback saves tokens and redirects with ok`, `startConnect without config returns error`, `sameOrigin rejects other origin and null`. Kör: FAIL.
- [ ] **Step 2:** Implementera; routerna kräver session (`getSessionUser`), sätter/rensar state-cookien (`HttpOnly`, `SameSite=Lax`, `Path=/api/connect`, 600 s, `Secure` på https) och är tunna. Kör: PASS. Commit.

### Task 5: Inställningar, kort och dokumentation
**Files:** Modify `src/app/(app)/installningar/page.tsx`, `src/components/home/cards.tsx`, `docs/DRIFT.md`, `docs/LOKALT.md`, `README.md`; Create `src/components/disconnect-button.tsx`
- [ ] **Step 1:** Inställningar visar per tjänst: Ansluten / Ej ansluten / Anslut igen / Saknar konfiguration, med knapp Anslut (länk till `/api/connect/<id>`) eller Koppla från (POST), samt meddelande från `?ok=`/`?fel=`.
- [ ] **Step 2:** Uppdatera Sonos- och Spotify-korten till de nya fälten. Dokumentera hur man skapar appar hos Sonos och Spotify och vilka redirect-URI:er som ska registreras.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test && npm run build`. Starta appen, kontrollera att Anslut leder till tjänstens authorize-URL med rätt parametrar (curl mot `/api/connect/spotify` med session). Commit och push.

## Self-review
- **Spec-täckning:** OAuth och state (T1, T4), krypterad lagring och förnyelse (T2), dataflöde och fellägen (T3), anslut/koppla från (T4, T5), säkerhet (T1, T2, T4), dokumentation (T5). Overifierade API-detaljer redovisas i spec och i `docs/DRIFT.md`.
- **Typkonsistens:** `OAuthProviderId`, `TokenSet`, `getAccessToken` och `createSpotifyProvider`/`createSonosProvider` har samma namn och signatur i T1–T5.
