# Hemskärm – etapp 2: Sonos och Spotify (design)

Bygger på `2026-11-07-etapp-1-grund-design.md`. Skrivskyddat: appen läser bara status, den styr inget.

## Mål
Sonos- och Spotify-korten visar riktig data från familjens konton i stället för demodata. Användaren ansluter varje tjänst via OAuth i Inställningar.

## Avgränsning
**Ingår:** OAuth (authorization code) för båda tjänsterna, krypterad tokenlagring med automatisk förnyelse, riktiga providermoduler, anslut/koppla från i Inställningar, tester med falsk HTTP-klient.
**Ingår inte:** styrning (play/pause/volym), flera Sonos-hushåll (första används), Spotify-historik utöver senast spelat, de övriga sex tjänsterna.

## Beslut
- **Ett konto, en anslutning per tjänst.** `Connection` (finns sedan etapp 1) unik på `(userId, provider)`. Tokens lagras som krypterad JSON `{accessToken, refreshToken, expiresAt}`.
- **Autentisering mot tjänsterna:** klienten (`client_id`/`client_secret`) skickas som HTTP Basic vid tokenutbyte och förnyelse. Hemligheterna ligger i miljövariabler: `SONOS_CLIENT_ID`, `SONOS_CLIENT_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. Saknas de visas "Saknar konfiguration" i Inställningar och inget anrop görs.
- **Redirect-URI:** `${BETTER_AUTH_URL}/api/connect/<tjänst>/callback`. Spotify kräver https eller en loopback-IP (`http://127.0.0.1:PORT`), aldrig `localhost`. Lokalt körs därför appen på `http://127.0.0.1:3000`.
- **CSRF:** en slumpad `state` sparas i en HttpOnly-cookie (SameSite=Lax, 10 min, path `/api/connect`) och måste matcha vid återkomsten. Koppla från (POST) kräver samma `Origin`.
- **Förnyelse:** access-token förnyas när mindre än 60 s återstår. Förnyelsen serialiseras per tjänst (en förnyelse åt gången), och en ny `refresh_token` ersätter den gamla om tjänsten skickar en. Misslyckas förnyelsen med `invalid_grant` markeras anslutningen `reauth` och kortet visar "Anslut" igen.
- **Frånkoppling** raderar `Connection` och tjänstens `Snapshot`-rader.
- **Kortstatus:** ansluten och fungerar → `ok`; fel eller utebliven kontakt → `stale`/`unavailable` (som i etapp 1); ej ansluten eller `reauth` → `not_connected`.

## Dataflöde
**Spotify.** `GET /v1/me/player`. Svar 200 ger spelar/pausad, låt, artist och enhet. Svar 204 betyder att inget är aktivt: då hämtas `GET /v1/me/player/recently-played?limit=1` för senast spelat. Scope: `user-read-playback-state user-read-recently-played`. Poddavsnitt använder `show.name`, reklam visas som "Reklam".
**Sonos.** `GET /households` (första), `GET /households/{id}/groups`, sedan `GET /groups/{id}/playback`, `.../playbackMetadata` och `.../groupVolume` för den grupp som spelar (annars första gruppen). Rum = koordinatorns spelarnamn, övriga spelare i gruppen visas som grupperade. Scope: `playback-control-all`.
TTL: Sonos 15 s, Spotify 30 s (oförändrat). Tjänstefel blir `stale` med senast kända data.

## Datamodell
Ingen migrering. Spotifys och Sonos payload-scheman ändras (artist tillkommer, Spotifys `playlist`/`todayMinutes` tas bort eftersom API:et inte ger dem på ett pålitligt sätt). Gamla cachade rader som inte längre klarar schemat ignoreras (test finns sedan etapp 1).

## Säkerhet
- Tokens lämnar aldrig servern och loggas aldrig. Felmeddelanden innehåller aldrig hemligheter eller svarskroppar.
- Callback och koppla från kräver inloggad session.
- `code` och `state` valideras innan något anrop görs.

## Verifierat och overifierat
Verifierat via sökning: Spotifys redirect-regler (https eller loopback-IP, inte `localhost`); Sonos `POST /login/v3/oauth/access` med Basic-auth, scope `playback-control-all`, `state`-parameter.
**Ej verifierat mot riktiga tjänster** (dokumentationssidorna nås inte härifrån och inga nycklar finns): exakta Sonos-sökvägar och fältnamn (`/households`, `/groups`, `playbackMetadata`, `groupVolume`) och Spotifys svarsfält. De är skrivna från minnet. Koden testas mot falska svar, så en första riktig körning kan kräva små justeringar.

## Test
Enhet: OAuth-URL, tokenutbyte och förnyelse, state-kontroll, same-origin-kontroll. Integration mot databasen: tokenlagring krypterad, förnyelse vid utgång, enkel förnyelse vid samtidiga anrop, `reauth` vid `invalid_grant`, frånkoppling raderar snapshots. Providermoduler mot falska svar (200, 204, 401, 429, tom grupp, poddavsnitt, reklam).
