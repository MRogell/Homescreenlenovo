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
Gör **Redeploy**. Inställningar visar "Ansluten via brygga", och kortet hämtar data högst var 30:e minut.

## Risker
- **Inofficiellt API:** Škoda kan ändra det utan förvarning. Ett konto kan låsas vid många misslyckade inloggningar; bryggan loggar därför in högst
  en gång per 10 minuter och hemskärmen frågar högst var 30:e minut. Fel och loggar visar aldrig inloggningsuppgifter.
- **Overifierat:** inget är provat mot ett riktigt Škoda-konto. Bryggan är skriven mot bibliotekets verkliga modeller och testad med byggda svar.
  Visar kortet "Ej tillgänglig": titta i bryggans Vercel-projekt → Logs.

## Lokalt (för utveckling)
```bash
cd skoda-bridge
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
SKODA_BRIDGE_TOKEN=... SKODA_USERNAME=... SKODA_PASSWORD=... .venv/bin/python -m skoda_bridge   # http://127.0.0.1:8080/api/skoda
```
