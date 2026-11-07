# Škoda på hemskärmen
Škoda har inget öppet API. Hemskärmen läser bilens status via en liten Python-funktion, `api/skoda.py`, som ligger i **samma Vercel-projekt**
och använder det inofficiella biblioteket [myskoda](https://pypi.org/project/myskoda/) (pinnat till 2.17.2, kräver Python 3.13).
Kortet är skrivskyddat: det visar batteri eller tank, räckvidd, låst/olåst, laddning och parkeringsplats, men styr ingenting.

## Status: fungerar inte i samma Vercel-projekt
Första bygget visade att Vercel **inte** bygger Python-funktioner i `api/` när projektet är ett Next.js-projekt
("The pattern api/skoda.py defined in functions doesn't match any Serverless Functions"). Konfigurationen är därför borttagen och
Škoda är **inte påslaget**. Lägg inte in `SKODA_*`-variablerna i hemskärmens projekt förrän bryggan körs någon annanstans:
då pekar `SKODA_BRIDGE_URL` på den värden. Koden i `skoda_bridge/` är oförändrad och kan köras som egen tjänst (se nedan).

## Risker och begränsningar
- **Inofficiellt API:** Škoda kan ändra det utan förvarning. Ett konto kan låsas vid många misslyckade inloggningar.
  Därför loggar funktionen in högst en gång per 10 minuter och hemskärmen frågar högst var 30:e minut.
- **Lösenordet** finns bara som miljövariabel i Vercel, aldrig i databasen eller koden. Fel och loggar visar aldrig inloggningsuppgifter.
- **Overifierat:** inget är provat mot ett riktigt Škoda-konto, och det är inte provat att Vercel kör Python 3.13 i ett Next.js-projekt.
  Misslyckas bygget eller visar kortet "Ej tillgänglig", titta i Vercel → **Logs** (filtrera på `/api/skoda`).

## Köra bryggan som egen tjänst
Kör samma kod på en annan värd (t.ex. Render Web Service): build `pip install -r requirements.txt`, start `python -m skoda_bridge` (lyssnar på `$PORT`),
samma miljövariabler. Lägg sedan `SKODA_BRIDGE_URL` (värdens adress) och samma `SKODA_BRIDGE_TOKEN` i hemskärmens projekt.

## Lokalt
```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                                      # bryggans tester
SKODA_BRIDGE_TOKEN=... SKODA_USERNAME=... SKODA_PASSWORD=... .venv/bin/python -m skoda_bridge
# I appens .env: SKODA_BRIDGE_URL="http://127.0.0.1:8080" och samma SKODA_BRIDGE_TOKEN
```
