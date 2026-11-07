# Hemskärm – Škoda via brygga (design)

Etapp 3, första delen. Skrivskyddad: visar bilens status, styr ingenting (ägarens val).

## Mål
Škoda-kortet visar riktig data: batteri eller bränslenivå, räckvidd, om bilen är låst, om den laddar och var den står parkerad.

## Varför en brygga
Škoda har inget öppet API. Det finns ett inofficiellt Python-bibliotek, `myskoda`, som loggar in med e-post och lösenord. Biblioteket kräver **Python ≥ 3.13**, och hemskärmen är TypeScript på Vercel. Därför läser appen från en **separat liten tjänst** (`skoda-bridge/`, eget Vercel-projekt eller annan Python-värd) som anropar biblioteket.

## Utfall av försöket med samma projekt
Vercel byggde inte `api/skoda.py` i Next.js-projektet (bygget avbröts av `functions`-mönstret). Konfigurationen är borttagen; bryggan måste köras som egen tjänst och nås via `SKODA_BRIDGE_URL`. Beslut om värd tas med ägaren.

## Ändring (ägarens val: enklare driftsättning)
Bryggan ligger nu i **samma Vercel-projekt** som hemskärmen: `api/skoda.py` (Vercel Python-funktion) med logiken i `skoda_bridge/`.
Appen anropar som standard sin egen adress `${BETTER_AUTH_URL}/api/skoda`. En gemensam variabel `SKODA_BRIDGE_TOKEN` används av båda.
`SKODA_BRIDGE_URL` behövs bara om bryggan körs på annan värd. Resten av beslutet nedan gäller oförändrat.

## Beslut
- **Gränssnitt mellan appen och bryggan:** `GET {SKODA_BRIDGE_URL}/api/status` med `Authorization: Bearer {SKODA_BRIDGE_TOKEN}`. Svar: `{rangeKm, levelPct, levelKind: "battery"|"fuel", locked, charging, parked, fetchedAt}`, där alla utom `levelKind`, `charging` och `fetchedAt` kan vara `null`.
- **Škoda-inloggningen** (`SKODA_USERNAME`, `SKODA_PASSWORD`, valfri `SKODA_VIN`) ligger bara som hemliga variabler i bryggan, aldrig i appens databas eller kod.
- **Skydd av kontot:** appens cache (TTL 30 min) och en spärr i bryggan (högst en inloggning per 10 min, annars senast kända svar) håller antalet inloggningar lågt. Misslyckas bryggan visar kortet "Ej tillgänglig" med senast kända data (som övriga kort).
- **Delvisa svar:** varje anrop mot Škoda (laddning, status, räckvidd, plats) kan misslyckas för sig, t.ex. på en bensinbil utan laddningsdata. Det som saknas blir `null`. Först om allt misslyckas svarar bryggan med fel.
- **Bryggans skydd:** konstanttidsjämförelse av token, tokenkrav ≥ 32 tecken, fel avslöjar aldrig inloggning eller bibliotekets detaljer.
- **Ansluten** = `SKODA_BRIDGE_URL` och `SKODA_BRIDGE_TOKEN` är satta i appen. Annars visar kortet "Anslut".

## Begränsningar och risker
- Ingen av delarna är provad mot ett riktigt Škoda-konto eller en riktig Vercel-bygg. Bryggan är skriven mot bibliotekets verkliga modeller (läst ur version 2.17.2, pinnad) men har bara körts mot byggda testsvar.
- Inofficiellt API: Škoda kan ändra det utan förvarning, och ett konto kan låsas vid många misslyckade inloggningar. Biblioteket friskriver sig själv från ansvar.
- Om Vercels Python-runtime inte stöder 3.13 måste bryggan köras på annan värd (samma kod, `server.py`).

## Test
Brygga (pytest): kartläggning av laddnings-, status-, räckvidds- och parkeringssvar (elbil, bensinbil, delvis fel, okänt låsläge), tokenkontroll, spärr, och att fel aldrig innehåller inloggning. Appen (Vitest): providern mot falska svar (200, 401, 429, 5xx, ogiltig JSON, null-fält), `isConnected`, och att demodata fortfarande klarar schemat.
