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

## Kalender (iCal)
Kalendrar läggs till under Inställningar → Kalender med den hemliga iCal-adressen (Google Kalender: Inställningar → din kalender → "Hemlig adress i iCal-format"; `webcal://` fungerar också).
- Adressen sparas krypterad (AES-256-GCM med `BETTER_AUTH_SECRET`) i `AppSetting` ("calendars") och skickas aldrig tillbaka till webbläsaren, bara värdnamnet.
- Servern hämtar bara https, blockerar lokala och privata adresser (även efter DNS och vid omdirigering), 8 s timeout och högst 3 MB.
- Högst 6 kalendrar. Byter du `BETTER_AUTH_SECRET` måste kalendrarna läggas till igen.

## Notiser (iPhone)
Notiser skickas med Web Push och kräver ingen extra tjänst eller miljövariabel.
- **Nycklar:** Push-nycklarna (VAPID) skapas första gången de behövs. Den privata nyckeln sparas krypterad i `AppSetting` ("vapid"). Byts `BETTER_AUTH_SECRET` skapas nya nycklar och alla enheter måste slå på notiser igen.
- **Slå på:** På iPhone måste appen först läggas till på hemskärmen (iOS 16.4 eller nyare). Sedan Inställningar → Notiser → Slå på notiser i den installerade appen.
- **Vad som upptäcks:** Förändringar jämförs när startsidan hämtar färsk data (plattan frågar var 30:e sekund, så den fungerar som vakt). Är plattan avstängd märks ingenting förrän någon öppnar appen. Vercel Hobby tillåter bara cron en gång per dygn, så det kan inte användas.
- **Slag:** AEG klar, bilen laddad (eller laddningen stoppade under målet) och bilen olåst på natten (22–06, en gång per natt, av från början). Jämförelser äldre än 2 timmar ger ingen notis.
- **Dubbletter:** Varje händelse har en unik nyckel i `notification_event`, så den skickas bara en gång även om flera enheter märker den samtidigt.
- **Enheter:** Högst 10. Döda prenumerationer (404/410 från Apple eller Google) tas bort automatiskt.
- **Migrering:** `push_notiser` skapar tabellerna `push_subscription` och `notification_event`; produktionsbygget kör den.

## Vädervarningar (SMHI)
Raden under hälsningen visar SMHI:s gula, orange och röda varningar som gäller den valda väderplatsen (Inställningar → Utseende). Färgen följer den allvarligaste.
- **Källa:** `https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json` (en fil för hela landet, ingen nyckel). Servern matchar platsen mot varningsområdenas polygoner.
- **Villkor:** SMHI:s villkor för konsekvensbaserade varningar kräver att informationen inte ändras, att SMHI anges som källa och att tiderna visas. Rubrik och nivåtext förs därför vidare oförändrade, raden säger "(SMHI)" och visar sluttid (eller starttid om varningen inte börjat). Se https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning
- **Hämtning:** Följer vädrets cache, var 15:e minut, och var 5:e minut medan en varning gäller. "Meddelande" (t.ex. risk för vattenbrist) räknas inte som varning. Varningar som börjar mer än två dygn fram visas inte än.
- **Fel:** Går SMHI inte att nå visas vädret ändå och inga varningar. En trasig post hoppas över utan att övriga påverkas.
- **Utanför Sverige:** Platser utanför SMHI:s områden får inga varningar.

## Säkerhet
- **Skyddsrubriker** (`next.config.ts`): CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` och HSTS på alla svar. CSP tillåter Google Fonts (teckensnitt) och https-bilder (skivomslag); allt annat externt är stängt. Lägger du till en ny extern källa (bilder, teckensnitt, anrop från webbläsaren) måste den läggas i CSP:n, annars blockeras den.
- **Inloggningsgräns:** Försöksräknaren ligger i databasen (`rate_limit`), inte i minnet, eftersom Vercels instanser annars har var sin räknare. 10 inloggningsförsök per minut och adress. `AUTH_RATE_LIMIT_SCALE` ignoreras i Production.
- **Anrop som ändrar något** kräver inloggning, samma Origin och strikt kontrollerad indata. Škoda-bryggan jämför token i konstant tid.

## Tillgänglighet
Granskad mot WCAG 2.1 AA (axe-core, kontrastberäkning, tangentbord, reflow). Textkontrast klarar 4,5:1 i både mörkt och ljust läge. Formulärfält, reglage och färgval har en egen kantfärg (`--field-line`, minst 3:1 mot ytan). Sidorna har `<main>`. Kvar med flit: zoom är avstängd (se `viewport` i `layout.tsx` och `NoZoom`), vilket avviker från WCAG 1.4.4.

## Inköp och lappar
Kortet "Inköp" på hemskärmen och sidan `/handla` (stor vy för butiken). Listan delas av alla enheter och sparas i `AppSetting` ("lists"), så ingen ny tabell eller extern tjänst behövs.
- **Smart:** Varorna sorteras i butikens ordning (frukt, bröd, mejeri, kött, skafferi, fryst, dryck, godis, hushåll). Mängd tolkas ur texten ("2 mjölk", "mjölk 2 l", "3x ägg"), flera varor kan skrivas på en gång ("mjölk, ägg, bröd"), samma vara läggs inte dubbelt, och det ni brukar köpa föreslås.
- **Offline:** Ändringar köas i telefonen och skickas när nätet är tillbaka. Varje ändring har ett eget id, så en omsänd ändring ger aldrig en dubblett. Service workern sparar handlalägets skal och Next.js filer så att `/handla` kan öppnas utan täckning (sidan innehåller ingen listdata).
- **Samtidigt:** Två enheter som sparar samtidigt köar (advisory lock i databasen), så inget skrivs över.
- **Gränser:** 300 varor, 30 lappar, 60 ändringar per anrop.
- **Återställ allt** (Utseende) rör bara utseendet och notisvalen. Tidigare raderade den även kalendrar och push-nycklar; det är rättat.

## Middagsplan
Fliken "Middag" i inköpskortet (och på `/handla` i stor vy). Planen ligger i samma delade lista som inköpen (`AppSetting` "lists": `dinners`, `recipes`, `habits`, `people`), så den synkas, köas offline och delas med familjelänkar på samma sätt.
- **Rätter:** Inbyggda rätter (`src/lib/dinner.ts`) med mängder som skalas efter antal personer, och egna recept (högst 40, 30 rader var). Egna recept går före inbyggda med samma namn.
- **Skriv fritt:** "Tacos ons" sätter onsdag, "fredagstacos" sätter fredag och gör den till en vana. Vanor föreslås varje vecka som en ljus rad med knappen "Lägg in".
- **Inköpslistan:** "Lägg ingredienser på listan" lägger alla ingredienser för planerade dagar utan dubbletter (samma vara som redan finns läggs inte till). Dagen märks "på listan".
- **Hemskärmen:** Raden under hälsningen visar "Middag idag: …" när inget annat kräver uppmärksamhet (varningar går före).
- **Städning:** Dagar äldre än 14 dagar rensas automatiskt.

## Förvärm till avresa
Avresetid per veckodag (olika tider möjliga), förvärmning startar `leadMin` minuter före om det är kallare än gränsen. Inställningarna ligger i `AppSetting` ("departure") och nås från raden under klimatrutan i Škoda-kortet.
- **Hur:** Det finns ingen bakgrundsjobbare på Vercel Hobby. Det är därför en öppen och uppkopplad skärm (surfplattan) som, vid sin ordinarie hämtning var 30:e sekund, får servern att kontrollera tiden och starta klimatet (`after()` i `/api/home`). Stängs alla skärmar eller tappar de nätet startar inget.
- **Bara en gång:** Start görs under advisory lock (727003), så flera skärmar startar bilen en gång. Upp till tre försök.
- **Alltid när på och kallt:** Škoda-datat har ingen laddkabelflagga, så det finns inget "bara när inkopplad".
- **Notis:** Egen notistyp "Förvärm" (av/på under Notiser). "Hoppa över idag" nollställs nästa dygn.

## Två avresetider per dag och personer per vecka
- **Avresa:** Varje dag kan ha upp till två tider (till exempel morgon och kväll). Varje tid är en egen körning (`last.slot`), så morgonens start spärrar inte kvällens. "Hoppa över idag" gäller båda. Äldre inställningar med en tid per dag läses som en lista med en tid.
- **Personer:** Middagsplanen räknar 6 personer i udda ISO-veckor och 2 i jämna (ändras under Recept i Middag-fliken). Mängderna skalas per dag, och samma rätt över en veckogräns summeras till en rad på inköpslistan. Äldre data med ett enda antal får grundinställningen 6/2.
