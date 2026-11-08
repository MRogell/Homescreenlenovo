# Škoda: styra klimatisering (design)

Bygger på `2026-11-07-skoda-brygga-design.md`. Första gången appen styr bilen och inte bara läser.

## Mål
Starta och stoppa bilens klimatisering med vald temperatur från Škoda-kortet, så att Škoda-appen inte behövs för det.

## Avgränsning
**Ingår:** start med temperatur, stopp, visning av läge (av/på, måltemperatur, beräknad tid till måltemperatur).
**Ingår inte:** fönstervärme, sätesvärme, timers, tillsatsvärmare (kräver S-PIN), lås/upplåsning.

## Gränssnitt i kortet
- Ny rad under statusrutorna: **Klimat**, temperaturväljare `[–] 21,0 °C [+]` (16–29,5 °C, steg 0,5), knapp **Starta**. Tryckytor minst 48 px.
- När klimatiseringen är på: texten "Klimat på · 21 °C · varm ca 07:45" och knappen **Stoppa**.
- Ingen bekräftelse (ofarligt, lätt att stoppa). Knappen visar "Startar…"/"Stoppar…" tills svaret kommit.
- Senast vald temperatur sparas i webbläsaren (`localStorage`, med try/catch); annars bilens måltemperatur, annars 21 °C.

## Flöde
1. `POST /api/control/skoda` i hemskärmen, via befintliga `handleControl`: tjänst, session, Origin (`sameOrigin`), strikt Zod-indata
   (`{action:"climate_start", temperatureC}` där temperaturen är 16–29,5 i steg om 0,5, eller `{action:"climate_stop"}`).
2. Hemskärmen anropar bryggan: `POST {SKODA_BRIDGE_URL}/api/skoda` med Bearer-token och JSON `{"climate":"start","temperatureC":21}` eller `{"climate":"stop"}`.
   Samma Vercel-funktion som GET (Vercel kopplar `api/skoda.py` till exakt `/api/skoda`).
3. Bryggan validerar indata, loggar in, skickar `start_air_conditioning(vin, temp)` / `stop_air_conditioning(vin)` och hämtar
   sedan sammanfattningen i samma inloggning. Svaret är den nya sammanfattningen.
4. Hemskärmen sparar svaret som ny snapshot och rensar backoff; kortet laddas om och visar läget direkt.

## Avläsning
Sammanfattningen får fälten `climateOn: boolean|null`, `climateTargetC: number|null`, `climateReadyAt: string|null` (ISO) från
`get_air_conditioning` (ett extra anrop i samma inloggning). Valfria i hemskärmens schema (äldre svar godtas).
TTL: 2 min när bilen laddar eller klimatiseringen är på, annars 15 min.

## Skydd för kontot
- Kommandon har en egen spärr: högst ett per 30 s (annars 429 "Vänta en halv minut").
- Ett kommando blockeras inte av lässpärren (100 s), men räknas som en inloggning: läsningar efter ett kommando väntar som vanligt.
- Indata utanför tillåtet intervall nekas i både hemskärm och brygga innan något anrop till Škoda görs.

## Fel
| Situation | Brygga | Kortet |
|---|---|---|
| Ogiltig indata | 400 | "Ogiltigt kommando" |
| Kommando för tätt | 429 | "Vänta en halv minut och försök igen" |
| Škoda/bilen nekar eller svarar inte | 502 | "Bilen tog inte emot kommandot" |
| Fel token / saknad konfiguration | 401 / 500 | som i dag |
Bara feltypens namn loggas; aldrig inloggningsuppgifter, token eller bibliotekets feltext.

## Test
- pytest: start/stopp med falsk klient, ogiltig temperatur ger 400 utan anrop, kommandospärr 30 s, lässpärren stoppar inte kommando,
  kommando räknas för lässpärren, fel ger 502 utan hemligheter, klimatfälten i sammanfattningen (på/av/okänt).
- Vitest: kontrollflödet (session, Origin, indata, bryggans svar sparas som snapshot, felkoder), visningslogik för klimatraden, TTL.
- Skärmbilder på P12 och iPhone 15 Pro.

## Overifierat
Prövat endast mot falska svar. Bilen kan ta 10–30 s att svara och ibland bekräfta senare; rätt läge visas då vid nästa
avläsning (inom 2 min när klimatiseringen är på). Fältnamn enligt myskoda 2.17.2.
