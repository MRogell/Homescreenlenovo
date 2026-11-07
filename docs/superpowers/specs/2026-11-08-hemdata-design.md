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
