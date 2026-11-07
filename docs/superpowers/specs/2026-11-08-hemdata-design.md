# Hemskärm – samma data som i Google Home (design)
Google Home har inget gränssnitt som hemskärmen får läsa. I stället hämtas samma uppgifter från källorna (ägarens val, i denna ordning):
1. **Väder och luftkvalitet** (denna leverans).
2. **Inomhustemperaturer från Tado** (nästa).
3. **Diskmaskinen från AEG via Electrolux utvecklar-API** (därefter).
Plejd-lamporna kan bara läsas lokalt via Bluetooth och nås fortsatt via Google Home-knappen.

## 1. Väder och luftkvalitet
- Källa: **Open-Meteo** (gratis för icke-kommersiellt bruk, ingen nyckel). Väder: `api.open-meteo.com/v1/forecast` med `current=temperature_2m,weather_code,wind_speed_10m`,
  `wind_speed_unit=ms`. Luftkvalitet: `air-quality-api.open-meteo.com/v1/air-quality` med `current=european_aqi`.
- Plats: `WEATHER_PLACE`, `WEATHER_LAT`, `WEATHER_LON`; standard Luleå (65.5848, 22.1547).
- Kortdata: `{place, tempC, code, text, windMs, aqi, aqiLabel}`. Väder krävs; misslyckas luftkvaliteten blir `aqi` och `aqiLabel` `null` (kortet visar ändå vädret).
- Väderkod (WMO) → svensk text; europeiskt luftkvalitetsindex → Bra (≤20), Ganska bra (≤40), Måttlig (≤60), Dålig (≤80), Mycket dålig (≤100), Extremt dålig.
  Googles "LKI" använder en annan skala och källa, så siffran kan skilja.
- TTL 15 min, tidsgräns 10 s. Inställningar visar "Öppen data (Open-Meteo)".
- Layout: nedre raden Arlo, Väder och Google Home (två kolumner, sedan en när Tado kommer).

## Overifierat
Ingen av källorna kunde nås från byggmiljön. Fältnamnen följer Open-Meteos dokumentation och är testade mot påhittade svar.

## 2. Inomhustemperaturer från Tado (äldre generation, V3/V3+)
- **Inloggning:** Tados enhetskodsflöde. Inställningar → "Anslut Tado" → servern anropar `POST login.tado.com/oauth2/device_authorize`
  (`client_id`, `scope=offline_access`) och sparar den väntande koden krypterat (`connection.status = "pending"`). Användaren öppnar
  `verification_uri_complete` och godkänner. Sidan frågar servern var `interval`:e sekund; servern frågar `POST /oauth2/token`
  (`grant_type=urn:ietf:params:oauth:grant-type:device_code`). `authorization_pending`/`slow_down` = vänta, `expired_token`/`access_denied` = avbrutet.
- **Klient-id:** Tados publika klient (inget hemligt), kan ändras med `TADO_CLIENT_ID`. Ej verifierat här (skrivet efter Tados hjälpartikel och community-bibliotek).
- **Tokens:** krypterade som Sonos/Spotify. Refresh-token roteras vid varje förnyelse; förnyelsen går under samma Postgres-lås.
- **Data:** `GET /me` (hem-id) och `GET /homes/{id}/zones` (rumsnamn, bara `HEATING`) sparas i `connection.settings.tado` och förnyas en gång per dygn.
  Varje uppdatering är ett enda anrop: `GET /homes/{id}/zoneStates` → per rum temperatur, luftfuktighet, måltemperatur och om det värms.
- **Kvot:** Tado tillåter 100 anrop/dygn för vanliga konton. TTL 20 min (72/dygn) och 10 min väntetid efter fel (t.ex. 429).
- **Kort "Inomhus":** alla rum i bokstavsordning med temperatur, som i Google Home. Pillret visar hur många rum som värms.
