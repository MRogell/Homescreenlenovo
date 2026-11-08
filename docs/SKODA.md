# Škoda på hemskärmen
Škoda har inget öppet API. Bilens status läses av en liten Python-tjänst, **Škoda-bryggan** (mappen `skoda-bridge/`), som använder det inofficiella
biblioteket [myskoda](https://pypi.org/project/myskoda/) (2.17.2, kräver Python 3.13). Bryggan är ett **eget Vercel-projekt**: Vercel bygger inte
Python-funktioner i ett Next.js-projekt. Kortet är skrivskyddat: batteri eller tank, räckvidd, låst/olåst, laddning och parkeringsplats.

## 1. Skapa bryggans Vercel-projekt
1. Vercel → **Add New → Project** → välj samma repo (`Homescreenlenovo`).
2. **Project Name:** t.ex. `hemskarm-skoda`.
3. **Root Directory:** klicka **Edit** och välj mappen **`skoda-bridge`**.
4. **Framework Preset:** **Other**. Build/Output: lämna som det är.
5. **Environment Variables** (Production):

   | Key | Value |
   |---|---|
   | `SKODA_USERNAME` | e-post till ditt MySkoda-konto |
   | `SKODA_PASSWORD` | lösenordet till MySkoda (Sensitive) |
   | `SKODA_BRIDGE_TOKEN` | slumpad hemlighet, minst 32 tecken (Sensitive) |
   | `SKODA_VIN` | valfritt: chassinummer om kontot har flera bilar |

   Skapa token i PowerShell: `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`
6. **Deploy.** Bygget installerar `myskoda` och använder Python 3.13 (`.python-version`).
7. Kontroll: öppna `https://<bryggans-adress>/api/skoda` → `{"error": "Ej behörig"}` betyder att bryggan körs.

## 2. Koppla hemskärmen till bryggan
Hemskärmens projekt (`homescreenlenovo`) → Settings → Environment Variables (Production):
- `SKODA_BRIDGE_URL` = bryggans adress, t.ex. `https://hemskarm-skoda.vercel.app` (utan `/api/skoda`)
- `SKODA_BRIDGE_TOKEN` = **samma** värde som i bryggan (Sensitive)
- Ta bort `SKODA_USERNAME` och `SKODA_PASSWORD` från hemskärmens projekt om de ligger kvar: de behövs bara i bryggan.
Gör **Redeploy**. Inställningar visar "Ansluten via brygga", och kortet hämtar data var 5:e minut, eller var 2:a minut när bilen laddar eller klimatiseras.

## Batterinivå och räckvidd
Škoda skickar batterinivån på två ställen: i laddningsdelen (uppdateras främst under laddning) och i räckviddsdelen.
Bryggan tar procent och km från **samma** del, den som bilen rapporterade senast enligt bilens egen tidsstämpel,
så att kortet visar samma siffror som Škoda-appen. Bilens rapporttid står längst ner i kortet.

## Klimatisering
Škoda-kortet kan starta och stoppa bilens klimatisering (16–29,5 °C i steg om 0,5). Hemskärmen skickar kommandot till bryggan
(`POST /api/skoda` med `{"climate":"start","temperatureC":21}` eller `{"climate":"stop"}`), och bryggan loggar in, skickar
kommandot och läser av bilen i samma inloggning. Högst ett kommando per 30 s. Medan klimatiseringen är på hämtas data var 2:a minut.
Bilen kan ta en stund att reagera; rätt läge visas senast vid nästa avläsning. Senast vald temperatur sparas i webbläsaren.

## Risker
- **Inofficiellt API:** Škoda kan ändra det utan förvarning. Ett konto kan låsas vid många misslyckade inloggningar; bryggan loggar därför in högst
  var 100:e sekund, och hemskärmen frågar var 5:e minut (var 2:a minut under laddning och klimatisering). Fel och loggar visar aldrig inloggningsuppgifter.
- **Overifierat:** inget är provat mot ett riktigt Škoda-konto. Bryggan är skriven mot bibliotekets verkliga modeller och testad med byggda svar.
  Visar kortet "Ej tillgänglig": titta i bryggans Vercel-projekt → Logs.

## Lokalt (för utveckling)
```bash
cd skoda-bridge
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
SKODA_BRIDGE_TOKEN=... SKODA_USERNAME=... SKODA_PASSWORD=... .venv/bin/python -m skoda_bridge   # http://127.0.0.1:8080/api/skoda
```
