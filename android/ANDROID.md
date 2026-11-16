# Android-app (Google Play)

Android-appen är hemskärmen i en Android-ram (Trusted Web Activity). Själva appen ligger kvar på Vercel, så varje uppdatering av hemskärmen når Android-appen direkt, utan ny uppladdning i Google Play. Ramen behöver bara byggas om om namn, ikon eller paketnamn ändras.

**Paketnamn:** `lenovohomescreen.app` (gemener; kan aldrig ändras efter första uppladdningen).
**Adress:** `https://homescreenlenovo.vercel.app`

## Det som redan finns i appen
- Webbmanifest med namn, färger och ikoner (`/manifest.webmanifest`), liggande och stående.
- `/.well-known/assetlinks.json`: visar appen utan adressfält när `ANDROID_SHA256_FINGERPRINTS` är satt (steg 5).
- `/integritet`: publik integritetspolicy att ange i Google Play.
- `android/twa-manifest.json`: referens för Bubblewrap (samma värden som du anger i steg 2).
- `android/store/`: butiksbilder: ikon finns som `public/icons/icon-512.png`, `feature-graphic-1024x500.png`, `telefon-1080x2160.png`, `surfplatta-1920x1200.png`.

## 1. Installera verktygen på din dator
1. Node.js 20 eller senare (nodejs.org).
2. `npm install -g @bubblewrap/cli`
3. Första gången du kör Bubblewrap frågar den om den får hämta Java (JDK 17) och Android SDK åt dig. Svara ja.

## 2. Bygg appen (AAB-filen)
```
mkdir hemskarm-android
cd hemskarm-android
bubblewrap init --manifest=https://homescreenlenovo.vercel.app/manifest.webmanifest
```
Svara så här när den frågar (resten kan du lämna som förslaget):
- **Application ID:** `lenovohomescreen.app`
- **Application name / Launcher name:** `Hemskärm`
- **Display mode:** standalone
- **Orientation:** default
- **Status bar / Splash color:** `#0f1419`
- **Minsta Android-version (minSdkVersion):** 24 (Android 7.0). Byggbiblioteket kräver minst 24. Bubblewrap föreslår 21: om bygget fallerar med "minSdkVersion 21 cannot be smaller than version 24", ändra till 24 i `twa-manifest.json`, kör `bubblewrap update` och bygg igen.
- **Signing key:** välj att skapa en ny. Du får välja ett lösenord (två: nyckelbehållare och nyckel).

Sedan:
```
bubblewrap build
```
Du får `app-release-bundle.aab` (den filen laddar du upp) och `app-release-signed.apk` (för att prova direkt på en telefon).

**Viktigt:** spara filen `android.keystore` och båda lösenorden på ett säkert ställe, till exempel i lösenordshanteraren. Förlorar du dem kan du inte uppdatera appen på samma sätt (Google kan återställa uppladdningsnyckeln, men det tar tid).

## 3. Skapa appen i Google Play Console
1. Skapa app: namn `Hemskärm`, språk svenska, typ **App**, **Gratis**.
2. Fyll i det som Play Console kräver under *Dashboard → Set up your app*:
   - **Privacy policy:** `https://homescreenlenovo.vercel.app/integritet`
   - **App access:** appen kräver inloggning. Välj att delar av appen är begränsade och ange e-post och lösenord som granskaren kan använda (appen har ett enda konto, så använd tillfälligt ett lösenord som du byter efteråt).
   - **Ads:** nej.
   - **Content rating:** fyll i frågeformuläret (ingen våld, inga köp).
   - **Target audience:** 18 år och uppåt.
   - **Data safety:** appen samlar e-post och familjens egna data (listor, inställningar), skickar inget till reklam och delar inget. Data krypteras under överföring. Användaren kan be kontoägaren radera data.
   - **Category:** Livsstil eller Hem och bostad.
3. **Store listing:**
   - Kort beskrivning (högst 80 tecken): *Familjens smarta hem på en skärm: kalender, inköp, middag, bil och väder.*
   - Lång beskrivning: skriv vad appen gör (kalender, inköpslista och lappar, middagsplan, förvärm av bilen, väder, musik).
   - Ikon 512×512: `public/icons/icon-512.png`
   - Feature graphic: `android/store/feature-graphic-1024x500.png`
   - Telefonbilder: `android/store/telefon-1080x2160.png` (minst två krävs, ta fler egna efter behov)
   - Surfplattebilder (valfritt): `android/store/surfplatta-1920x1200.png`

## 4. Ladda upp AAB-filen (intern testning)
1. *Testing → Internal testing → Create new release*.
2. Låt Google hantera signeringen (*Play App Signing*, det är standard) och ladda upp `app-release-bundle.aab`.
3. Lägg till din egen e-post som testare, spara och publicera testversionen. Du får en länk att öppna på telefonen.

## 5. Koppla webbplatsen till appen (utan adressfält)
Utan det här visar appen ett adressfält upptill.
1. I Play Console: *Test and release → Setup → App signing*. Kopiera **SHA-256 certificate fingerprint** under *App signing key certificate*. Kopiera gärna även den under *Upload key certificate*.
2. Lägg dem som miljövariabeln `ANDROID_SHA256_FINGERPRINTS` i Vercel (projektet för hemskärmen, Production), kommaseparerade. Format: `AA:BB:CC:…` (32 par).
3. Gör **Redeploy** i Vercel.
4. Kontrollera att `https://homescreenlenovo.vercel.app/.well-known/assetlinks.json` visar en post med paketnamnet och dina avtryck.
5. Installera från testlänken. Om ett adressfält fortfarande syns: kontrollera avtrycket, vänta några minuter och rensa Chromes data för appen.

## 6. Till produktion
Ett personligt utvecklarkonto som skapades efter november 2023 måste först köra en **sluten testning** med minst 12 testare i 14 dagar innan du kan ansöka om produktionsutgivning (kontrollera Googles aktuella regler i Play Console). Företagskonton har inte det kravet.

## Nya versioner
- Ändringar i hemskärmen når appen direkt.
- Ny AAB behövs bara om ikon, namn eller paketnamn ändras: höj `appVersionCode` (i `twa-manifest.json` i din byggmapp), kör `bubblewrap update` och `bubblewrap build`, och ladda upp den nya filen.

## Gott att veta
- Appen behöver Google Chrome installerat på enheten (det är Chrome som kör sidan i ramen). Inloggningen finns kvar mellan starterna.
- Notiser går via Chromes webbnotiser och slås på i appen som vanligt.
- Spotify och Sonos kopplas som förut (inloggningssidan öppnas i Chrome och leder tillbaka).
- Förvärm och laddpåminnelse styrs av servertimern, inte av appen, så de fungerar även när appen är stängd.
