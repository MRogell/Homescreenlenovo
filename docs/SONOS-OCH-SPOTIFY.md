# Sonos och Spotify: sätta upp och kontrollera

## Sonos (en gång, ca 15 minuter)
1. Gå till developer.sonos.com och logga in (eller skapa konto) med samma konto som du använder i Sonos-appen.
2. Skapa en ny **Control Integration** (under dina integrationer). Fyll i:
   - Namn och beskrivning: valfria, t.ex. "Hemskärm".
   - **Redirect URI:** `https://homescreenlenovo.vercel.app/api/connect/sonos/callback` (exakt så, utan snedstreck sist).
3. Spara. Sonos visar en **nyckel (Key / client id)** och en **hemlighet (Secret)**. Menynamnen kan skilja sig något från det här.
4. Vercel → projektet → Settings → Environment Variables (Production): `SONOS_CLIENT_ID` = nyckeln, `SONOS_CLIENT_SECRET` = hemligheten (Sensitive). Gör **Redeploy**.
5. Hemskärmen → Inställningar → Sonos → **Anslut** → logga in hos Sonos och godkänn.
6. Tryck **Testa Sonos-anslutningen** (visas efter anslutning). Rummen ska listas med namn.

## Kontrollera Spotify
Hemskärmen → Inställningar → Spotify → **Testa Spotify-anslutningen**. Tre steg visas:
- **Inloggning:** ansluten och giltig. "Anslut igen" betyder att du ska trycka Koppla från och Anslut.
- **Spotify svarar:** vad Spotify ser just nu (spelar/pausad/ingen aktiv enhet). "Premium" i felet betyder att kontot saknar Premium eller inte är tillagt under *User Management* i Spotify-appen.
- **Enheter:** hur många enheter Spotify känner till, hur många som går att styra och hur många som är begränsade (och deras namn).
Testet läser bara och ändrar ingenting. Behörigheten för att *styra* prövas först när du trycker spela: fungerar det inte står "Anslut Spotify igen".
