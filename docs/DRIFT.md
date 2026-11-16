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
- **Hur:** Det finns ingen bakgrundsjobbare på Vercel Hobby (cron där går bara en gång per dygn). Därför startas klimatet av två saker: (1) en extern timer som ropar `/api/cron/preheat` varje minut (se Servertimer nedan), och (2) som reserv en öppen och uppkopplad skärm som vid sin hämtning var 30:e sekund får servern att kontrollera tiden (`after()` i `/api/home`). Utan timer startar inget när skärmarna är avstängda, och bakgrundsflikar och sovande plattor hämtar inte alls.
- **Bara en gång:** Start görs under advisory lock (727003), så flera skärmar startar bilen en gång. Upp till tre försök.
- **Alltid när på och kallt:** Škoda-datat har ingen laddkabelflagga, så det finns inget "bara när inkopplad".
- **Notis:** Egen notistyp "Förvärm" (av/på under Notiser). "Hoppa över idag" nollställs nästa dygn.

## Två avresetider per dag och personer per vecka
- **Avresa:** Varje dag kan ha upp till tre tider (till exempel morgon, lunch och kväll). Varje tid är en egen körning (`last.slot`), så morgonens start spärrar inte kvällens. "Hoppa över idag" gäller båda. Äldre inställningar med en tid per dag läses som en lista med en tid.
- **Personer:** Middagsplanen räknar 6 personer i udda ISO-veckor och 2 i jämna (ändras under Recept i Middag-fliken). Mängderna skalas per dag, och samma rätt över en veckogräns summeras till en rad på inköpslistan. Äldre data med ett enda antal får grundinställningen 6/2.

## Väder på surfplatta (allt på en skärm)
Väder-kortet går över två rader i första kolumnen och visar allt som i den vanliga vyn: nu, timmar, femdagarsprognos, sol och vind. Sonos är en kolumn bred i det läget. Förvärm-raden ligger i Škoda-kortets vänstra kolumn, så att klimatdialen behåller sin storlek.

## Škoda-klimat på surfplatta
Klimatrutan har samma design som på telefon: stor halvcirkel, minus och plus centrerade under värdet och Starta under. Dialens storlek följer kortets höjd (`cqh`). Mittenraden i rutnätet är därför högre (Škoda har mest att visa), och "Temperatur"-etiketten döljs när dialen blir liten.

## Barnvecka och "Vem hämtar?"
- **Barnvecka** = udda ISO-vecka (samma regel som 6/2 personer i middagsplanen). Märket "Barnvecka" visas bredvid hälsningen, och Kalender-kortet har en rad överst ("Barnvecka · v47" eller "Vecka 46"). På söndagar nämns att veckan byter imorgon.
- **Vem hämtar?** Två knappar bredvid hälsningen (idag och imorgon). Tryck öppnar en panel med sju dagar, tidigare använda namn att välja bland och fritt namnfält. Datat ligger i inköpslistans data (`pickups`, per datum, högst 40, äldre än 14 dagar rensas), så det synkas och köas offline på samma sätt, och familjemedlemmar med länk ser och ändrar det överst på sin sida. Vem som satt det bestäms av servern.
- Hemskärmen har en enda uppsättning av listorna (en `useLists`) som delas av Inköp-kortet och Vem hämtar.

**Tänd och släck:** Vem hämtar? och märket Barnvecka kan stängas av var för sig under Inställningar → Familjemedlemmar på hemskärmen (inställningen `show`). Vem hämtar? kan också döljas direkt från länken längst ned i panelen. Datat finns kvar när funktionen är släckt.

## Servertimer för Förvärm (gratis)
Utan den startar förvärm bara om en skärm är öppen i just starttidens fönster. Så här sätter du upp den, helt utan betalplan:
1. Skapa en hemlighet: `openssl rand -base64 24` (minst 16 tecken).
2. Lägg den som miljövariabeln `CRON_SECRET` i Vercel (projektet för hemskärmen, Production) och lägg ut på nytt.
3. Skapa ett gratiskonto på cron-job.org och ett jobb: adress `https://<hemskärmens adress>/api/cron/preheat`, varje minut, med rubriken `Authorization: Bearer <hemligheten>`.
4. Öppna Förvärm-inställningarna i appen: där står "Servertimern är aktiv (senast HH:MM)" när det fungerar.
Anropet gör inget dyrt utanför ett förvärmfönster (inga anrop till Škoda eller vädret). Fel hemlighet ger 401, saknad `CRON_SECRET` 503.

## Smarta funktioner (tänd och släck)
Inställningar → Smarta funktioner (`smart` i inställningarna). Notiserna slås av och på för sig under Notiser.
- **Laddpåminnelse:** En gång per dygn efter ett klockslag (grund 19:00, inom tre timmar) om bilen är ett elbilsbatteri på eller under en gräns (grund 40 %) och inte laddar. Okänt värde ger ingen påminnelse och markerar inte dagen, så nästa hämtning försöker igen. Körs av servertimern (och av hemskärmens hämtning). Notisnyckel per dygn, så den skickas högst en gång.
- **Timer:** Högst tre timers, delade mellan skärmarna (tabell `app_setting` "timers", lås 727004). Knappen sitter bredvid hälsningen. Servern skickar en notis när en timer gått av (via servertimern, högst en minut sen), och en öppen skärm pipar och visar "Klart!" tills den stängs av. Ljud kan blockeras av webbläsaren om sidan inte fått någon tryckning.
- Timers och laddkontrollen läggs på servertimern (`/api/cron/preheat`) utan ny konfiguration. Utanför fönster görs inga anrop till bilen eller vädret.

## Android-app
Se `android/ANDROID.md`. Appen är en Trusted Web Activity runt hemskärmen (paketnamn `lenovohomescreen.app`). Webbplatsen serverar `/.well-known/assetlinks.json` (miljövariabeln `ANDROID_SHA256_FINGERPRINTS`, kommaseparerade SHA-256-avtryck från Play Console) och en publik `/integritet`. Manifestet tillåter alla riktningar.

## P12 med många rum och lägre skärm
Inomhus lägger alla rum och snittrutan på en enda rad (`grid-auto-flow: column`), hur många rum det än är. Radernas minimihöjder är 176/250/164 px, så allt ryms utan scroll ned till cirka 1280×740. Under 215 px kortets höjd visas bara nästa händelse i kalendern och Spotify blir kortare. Sonos-chipsen delar på bredden. En smal väderkolumn tappar regnkolumnen (container-fråga, inte skärmbredd).

## Luftig P12 (en skärm, utan scroll)
På liggande surfplatta har alla kort mer luft (marginal 16×18 px, 14 px mellan korten) och allt som går att trycka på är minst 44 px högt (knappar, flikar, fält, chips, Starta, plus och minus, volymreglaget; reglaget för Förvärm har större träffyta än reglaget syns). I stället för att krympa knapparna försvinner sekundärt innehåll på låga kort: adressen i Škoda (under cirka 232 px), Sonos volym (under 240 px), Inköps varurader (under 190 px, antalet visas i rubriken) och AEG:s textrad.

**Ändring (P12 och andra lägre surfplattor):** Läget "allt på en skärm" gäller nu bara när fönstret är minst 900 px högt (`FIT_QUERY` i `use-fit.ts` och motsvarande `@media` i `globals.css`). På lägre skärmar, till exempel P12 med cirka 760 px synlig höjd, har korten sin naturliga höjd med fullt innehåll och sidan scrollar nedåt, aldrig åt sidan (`overflow-x: hidden`). Alla tryckytor är minst 44 px.

**Škoda först på lägre surfplattor:** På liggande skärmar under 900 px höjd (sidan scrollar) läggs Škoda-kortet först med CSS `order`, så att bilen och klimatet syns helt utan att scrolla (`.card.skoda { order: -1 }`). Kortens ordning under Inställningar → Utseende är oförändrad och gäller på telefon och höga skärmar.

## Förvärm längre när det är kallt
Inställningar → Smarta funktioner → "Förvärm längre när det är kallt" (`smart.coldLead`). Förvärmtiden (grunden, 10–30 min) får ett tillägg efter temperaturen: −5° till −10° +5 min, −10° till −20° +10 min, kallare än −20° +15 min (justerbart 0–30). Temperaturen är timprognosen för avresetimmen om den finns, annars nuvarande. Taket är 45 minuter. Gränsen "bara om det är X° eller kallare" och övriga regler är oförändrade. Kortet visar till exempel "Startar 06:55 (25 min före, −14° ute)". Servertimerns förkoll utgår från den längsta möjliga förvärmtiden, så att en kall morgon inte missas, och bedömningen görs sedan med verklig temperatur.

## Ny stil, rullande Inköp, middag på listan
- Ny visuell stil (kort med toning, runda färgade ikonchips, piller) i `globals.css`; Škoda-kortet trimmat så inget klipps i fit-läge.
- Inköp-kortet (liggande surfplatta ≥900px högt) visar alla varor och rullar inuti kortet (`.li-scroll`).
- "Spara och lägg på listan" lägger rättens namn på listan om inga ingredienser finns.

## Google Kalender (läsa och lägga till aktiviteter)
Kalenderkortet läser Google-kalendrarna direkt via Googles API och har knappen "Ny aktivitet" som skapar händelser i Google. Eftersom Google Kalender synkar med telefonen syns allt i iPhone-kalendern också (Inställningar → Kalender → Konton → lägg till Google-kontot). ICS-kalendrar fungerar som förut (bara läsning).
Engångsinställning:
1. console.cloud.google.com: skapa ett projekt, aktivera **Google Calendar API**.
2. OAuth-samtyckesskärm: typ **Extern**, lägg till familjens Google-adresser som testanvändare. **Publicera appen till "I produktion"** (annars slutar anslutningen gälla efter 7 dagar). Google visar en varning om ej verifierad app; välj "Avancerat → Fortsätt".
3. Autentiseringsuppgifter → skapa **OAuth-klient-id, typ Webbapplikation**. Auktoriserad omdirigerings-URI: `<BETTER_AUTH_URL>/api/connect/google/callback`.
4. Lägg `GOOGLE_CLIENT_ID` och `GOOGLE_CLIENT_SECRET` i Vercel (Production) och gör en ny deploy.
5. Inställningar → Google Kalender → Anslut Google (godkänn att se och ändra kalendrar).
Skapa händelse: `POST /api/calendar/events` (`src/server/calendar/events-flow.ts`), läsning i `src/server/providers/calendar.ts` och `src/server/calendar/google.ts`. Återkallar Google åtkomsten visas "Anslut igen".

## iCloud-kalender (iPhone)
Direkt koppling via CalDAV (`src/server/calendar/caldav.ts`, lagring i `icloud-store.ts`, anslutning i Inställningar → iCloud-kalender). Kräver Apple-ID och ett **appspecifikt lösenord** (appleid.apple.com → Logga in och säkerhet → Applösenord; kräver tvåfaktorsinloggning). Uppgifterna sparas krypterade. Kalenderkortet visar iCloud-kalendrarna och "Ny aktivitet" kan skriva till dem. Skrivet efter CalDAV-standarden men bara testat mot falska svar, inte mot ett riktigt iCloud-konto.

## Ny aktivitet som i Veckiva + Hemma den här veckan
- Formuläret "Ny aktivitet" (kalenderkortet) har samma fält som Veckiva: namn, datum, heldag, bortrest, tider, upprepning (varje dag/vecka, varannan vecka, månad, till och med), deltagare, ansvarig, plats, beskrivning, att ta med, vem ser den och delningsnivå (`src/components/home/calendar-add.tsx`, `src/lib/activity.ts`).
- Familjemedlemmar (vuxen/barn) läggs in under Inställningar → Familjemedlemmar; där ställs också dag och tid för barnens växling (`/api/family`).
- Till Google/iCloud skickas titel, tid, plats, upprepning (RRULE) och en beskrivning med deltagare och packlista. Deltagare, ansvarig, packlista, bortrest, synlighet och delningsnivå sparas hos oss (`activityMeta`) och visas på hemskärmen; synlighet och delningsnivå sparas men styr inget än (ett gemensamt konto).
- Trycker man på Barnvecka-märket (eller veckomärket i kalendern) öppnas "Hemma den här veckan": udda veckor alla, jämna bara de vuxna, bortrest idag undantagen, plus nästa växling.
