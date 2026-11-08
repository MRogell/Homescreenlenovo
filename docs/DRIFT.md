# Driftsättning
Vercel för webbappen och Render PostgreSQL för databasen: se `docs/VERCEL.md`. Det här dokumentet beskriver Render som webbtjänst (alternativ) och tjänsteanslutningarna.
Render (PostgreSQL) är första valet för databas.

1. **Databas:** skapa en PostgreSQL på Render. Den kostnadsfria planen **går ut 30 dagar efter att den skapats** och raderas efter 14 dagars frist
   (kontrollera Renders aktuella villkor). För data som ska bevaras: betald plan eller regelbundna säkerhetskopior med `pg_dump`.
2. **`DATABASE_URL`:** använd Renders externa adress och lägg `?sslmode=require` sist.
3. **Webbtjänst:** Node 22. Build: `npm install && npm run build`. Start: `npx prisma migrate deploy && npm start`.
4. **Miljövariabler:** `DATABASE_URL`, `BETTER_AUTH_SECRET` (minst 32 tecken, samma värde krypterar tjänstetokens: byts den måste anslutningar göras om),
   `BETTER_AUTH_URL` (publik https-adress).
5. **Plattan:** öppna adressen i Chrome på Lenovo P12, välj *Lägg till på startskärmen*. Appen startar i liggande helskärm.
6. **Säkerhetskopia:** `pg_dump "$DATABASE_URL" > hemskarm.sql` regelbundet.

## Sonos och Spotify (etapp 2)
Båda kräver en egen utvecklarapp. Hemligheterna läggs i miljövariablerna `SONOS_CLIENT_ID`, `SONOS_CLIENT_SECRET`, `SPOTIFY_CLIENT_ID` och `SPOTIFY_CLIENT_SECRET`
(på Render under Environment). Utan dem visar Inställningar "Saknar konfiguration".

**Redirect-URI:er** att registrera (basadressen är `BETTER_AUTH_URL`):
- `https://<din-adress>/api/connect/spotify/callback`
- `https://<din-adress>/api/connect/sonos/callback`

**Spotify:** skapa en app på developer.spotify.com/dashboard. Redirect-URI måste vara https, eller en loopback-IP som `http://127.0.0.1:3000/...` (aldrig `localhost`).
Appen är i utvecklarläge, vilket räcker för ett eget konto. Lägg till ditt Spotify-konto under *User Management* om tjänsten kräver det.
Scope som begärs: `user-read-playback-state user-modify-playback-state user-read-recently-played` (den mellersta behövs för att kunna spela, pausa och byta låt; Spotify Premium krävs).
Har du anslutit innan styrningen fanns: tryck **Koppla från** och **Anslut** igen så att den nya behörigheten godkänns.
**Sonos:** skapa en integration på developer.sonos.com (Control Integration). Scope som begärs: `playback-control-all`. Kortet visar alla rum och kan spela/pausa och byta låt per rum.

**Anslut:** logga in, öppna *Inställningar* och tryck *Anslut* vid tjänsten. Tokens lagras krypterade i databasen och förnyas automatiskt.
Om en tjänst återkallar åtkomsten visas "Anslut igen". *Koppla från* raderar anslutningen och den cachade datan.

**Overifierat:** Sonos- och Spotify-modulerna är testade mot falska svar. Exakta sökvägar och fältnamn kunde inte kontrolleras mot tjänsternas dokumentation eller riktiga konton
under bygget, så första riktiga körningen kan kräva små justeringar (se spec för etapp 2).

## Škoda (etapp 3)
Škoda läses via en Python-brygga i ett eget Vercel-projekt (`skoda-bridge/`). Steg-för-steg och risker: `docs/SKODA.md`.

## Tado (inomhustemperaturer)
Inga nycklar eller utvecklarappar behövs. Inställningar → Tado (inomhus) → **Anslut** → **Godkänn hos Tado** (öppnar Tados sida, logga in och godkänn koden).
Sidan blir klar av sig själv inom några sekunder. Kortet uppdateras var 20:e minut (Tado tillåter 100 anrop per dygn för vanliga konton);
vid fel eller slut kvot väntar appen 10 minuter. Gäller den äldre generationen (Smart Radiator Thermostat V3/V3+), inte tado X.

## AEG (diskmaskinen)
1. Logga in på developer.electrolux.one med samma konto som i AEG-appen.
2. Skapa en **API-nyckel** och generera **access-token** och **refresh-token** i portalen.
3. Hemskärmen → Inställningar → AEG → **Anslut**, klistra in de tre värdena och tryck **Spara**. De provas mot Electrolux innan de sparas
   (krypterade). Tokens förnyas automatiskt; om Electrolux återkallar dem visas "Anslut igen", och då skapar du nya i portalen.
Kortet uppdateras varje minut: läge (Av, Pågår, Klar …), program och tid kvar.
**Fjärrstyrning:** Starta, Pausa, Återuppta och Stoppa på kortet (Starta och Stoppa kräver ett extra tryck). För att kunna starta härifrån måste
fjärrstart vara påslaget på diskmaskinen (knapp/inställning på maskinen) och luckan stängd.

## Utseende (inställningar i appen)
Kortens ordning, vilka kort som visas, väderplats och nattläge sparas i databasen (tabellen `app_setting`) och ändras under Inställningar → Utseende.
Det kräver inget nytt bygge och inga miljövariabler. Saknas en inställning gäller grundvärdet (standardordning, `WEATHER_PLACE` med flera, nattläge av).
- **Migrering:** tabellen skapas av `npx prisma migrate deploy`, som körs automatiskt i bygget på Production (`scripts/migrate-on-deploy.mjs`). Preview-bygge rör aldrig databasen.
- **Väderplats:** sökningen använder Open-Meteos öppna ortssökning (utan nyckel). Miljövariablerna är reserv när ingen plats är vald.
- **Nattläge:** dämpar bilden med ett mörkt lager efter enhetens klocka. Skärmens riktiga ljusstyrka kan en webbapp inte ändra.
- **Kugghjulet** uppe vid klockan leder alltid till Inställningar, även om alla kort är dolda.
