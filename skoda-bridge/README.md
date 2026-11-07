# Škoda-brygga
Liten Python-tjänst som läser bilens status åt hemskärmen via det inofficiella biblioteket [myskoda](https://pypi.org/project/myskoda/) (pinnat till 2.17.2).
Hemskärmen anropar `GET /api/status` med en delad hemlighet. Bryggan är skrivskyddad: den styr ingenting.

**Inofficiellt API.** Škoda kan ändra det utan förvarning, och ett konto kan låsas vid många misslyckade inloggningar. Bryggan loggar därför in högst en gång per 10 minuter (annars senast kända svar), och hemskärmen hämtar högst var 30:e minut.
Bryggan är **inte provad mot ett riktigt konto** och är skriven mot bibliotekets modeller. Kräver **Python 3.13 eller nyare**.

## Miljövariabler (i bryggan)
| Namn | Värde |
|---|---|
| `BRIDGE_TOKEN` | slumpad hemlighet, minst 32 tecken (samma värde läggs i hemskärmen som `SKODA_BRIDGE_TOKEN`) |
| `SKODA_USERNAME` | e-post till ditt MySkoda-konto |
| `SKODA_PASSWORD` | lösenord till MySkoda-kontot |
| `SKODA_VIN` | valfritt: chassinummer om kontot har flera bilar (annars används första bilen) |

Skapa token i PowerShell: `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`.
Markera `SKODA_PASSWORD` och `BRIDGE_TOKEN` som **Sensitive**.

## Driftsätta på Vercel (eget projekt)
1. Vercel → **Add New → Project** → samma GitHub-repo (`Homescreenlenovo`). Detta blir ett **andra** projekt, skilt från hemskärmen.
2. **Root Directory:** `skoda-bridge`. **Framework Preset:** Other.
3. Lägg in miljövariablerna ovan (Production). Tryck **Deploy**.
4. Öppna `https://<bryggans-adress>/api/status` utan token: det ska ge `{"error": "Ej behörig"}` (401). Det visar att bryggan körs.
5. I **hemskärmens** Vercel-projekt lägger du till `SKODA_BRIDGE_URL` (bryggans adress, utan `/api/status`) och `SKODA_BRIDGE_TOKEN` (samma värde som `BRIDGE_TOKEN`). Gör **Redeploy**.

**Overifierat:** att Vercels Python-miljö stöder 3.13 (filen `.python-version` och `requires-python` pekar på 3.13). Om bygget klagar på Python-versionen, kör bryggan på annan värd, se nedan.

## Annan värd (till exempel Render)
Web Service, Python 3.13. Build: `pip install -r requirements.txt`. Start: `python server.py` (lyssnar på `$PORT`). Samma miljövariabler.

## Lokalt
```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                       # tester
BRIDGE_TOKEN=... SKODA_USERNAME=... SKODA_PASSWORD=... .venv/bin/python server.py
curl -H "Authorization: Bearer $BRIDGE_TOKEN" localhost:8080/api/status
```
