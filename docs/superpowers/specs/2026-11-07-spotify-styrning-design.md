# Hemskärm – Spotify-styrning (design)

Ändrar ett tidigare beslut: etapp 2 var skrivskyddad. Efter ägarens önskemål kan Spotify nu styras från hemskärmen. Sonos och övriga tjänster är fortfarande skrivskyddade.

## Mål
Spela/pausa, föregående och nästa från Spotify-kortet på plattan.

## Beslut
- **Knappar:** föregående, spela/pausa och nästa på kortet. Tryckytor minst 48 px (52/64 px).
- **Väg:** webbläsaren anropar `POST /api/control/spotify` med `{"action": "play"|"pause"|"next"|"previous"}`. Servern anropar Spotify (`PUT /me/player/play|pause`, `POST /me/player/next|previous`). Tokens lämnar aldrig servern.
- **Skydd, i den här ordningen:** känd tjänst (bara Spotify), giltig session, samma `Origin` som värden, strikt validerad indata (Zod `.strict()`), och först därefter anrop till Spotify.
- **Behörighet:** scope `user-modify-playback-state` tillkommer. Befintlig anslutning saknar den och måste göras om en gång (Inställningar → Anslut igen).
- **Cache:** efter ett lyckat kommando raderas Spotifys `Snapshot`, och klienten hämtar ny data efter 700 ms.
- **Fel (svenska texter, aldrig token eller svarskropp):** `reauth`, `scope` ("Anslut Spotify igen…"), `premium`, `no_device` ("Öppna Spotify på någon enhet först."), `rate_limit`, `failed`.

## Begränsningar
- Enligt min kännedom kräver Spotifys styr-API **Premium** (ägaren har det). Ej verifierat mot dokumentationen.
- Spotify spelar bara på en **aktiv** enhet. När ingen är aktiv (t.ex. Spotify pausad i bakgrunden på telefonen) hämtar appen tillgängliga enheter
  (`GET /me/player/devices`, begränsade enheter utesluts) och flyttar uppspelningen dit (`PUT /me/player` med `play: true`):
  en enhet → spelar direkt, flera → kortet visar en lista att välja i (`deviceId`, bara bokstäver och siffror, bara för "play"), ingen → tydligt fel.
  Om iPhone-appen syns i listan när den ligger i bakgrunden avgörs av Spotify och iOS.
- Sökvägar och felformat är skrivna från minnet och testade mot falska svar, inte mot riktiga Spotify.
- Ingen volymkontroll och ingen styrning av Sonos i den här leveransen.

## Test
Enhet: rätt metod och sökväg per kommando, 200/202/204 som lyckat, felmappning (401, 403 premium/scope/övrigt, 404, 429, 500, nätverksfel, icke-JSON). Flöde mot databasen: okänd tjänst (404), saknad session (401), fel Origin (403), ogiltig indata (400), lyckat (204 och bara Spotify-cachen raderas), felande kommando behåller cachen, `ReauthRequired` (409), oväntade fel läcker inga detaljer.

## Byta enhet (tillägg, ägarens önskemål)
- Knappen **"Byt enhet"** på kortet visar enheten som spelar nu. Ett tryck hämtar listan (`{"action": "devices"}` → `GET /me/player/devices`, begränsade enheter utesluts)
  och markerar den aktiva som "Spelar här".
- Val av annan enhet skickar `{"action": "transfer", "deviceId": "...", "play": <nuvarande läge>}` → `PUT /me/player`: spelade musiken fortsätter den där, annars förblir den pausad.
  Spotifys cache rensas efteråt.
- Samma skydd som övriga kommandon. Strikt indata: `devices` tar inga fler fält, `transfer` kräver `deviceId` (bokstäver och siffror) och `play` (boolean).
- Fel vid hämtning av listan visas (till skillnad från reservvägen vid "spela", som tyst ger en tom lista).

## Snabbare och standardenhet (tillägg, ägarens önskemål)
- **Väntetid efter fel (alla tjänster):** en tjänst som misslyckas frågas inte igen på 60 s (`provider_backoff`). Under tiden visas senast kända data
  ("Ej tillgänglig") eller felet. Lyckat svar och lyckat Spotify-kommando rensar väntetiden. Hindrar att en trasig tjänst bromsar varje uppdatering.
- **Snabbare knappar:** spela/pausa visas direkt (tillfälligt läge tills servern svarat), knapparna släpps när kommandot är klart och kortet uppdateras i bakgrunden.
  En öppen bytlista stängs när enheten ändras.
- **Standardenhet:** sparas på Spotify-anslutningen (`connection.settings.defaultDevice = {id, name}`), väljs i Inställningar bland enheterna Spotify ser.
  Vid "spela" utan aktiv enhet används den (matchas på id, annars namn) i stället för listan. Syns den inte för Spotify visas listan som tidigare.
- **Sonos-rum i Spotify Connect:** Spotify-appen hittar dem lokalt på wifi; Spotifys moln-API visar dem bara om de nyligen spelat. Vägen dit är Sonos-anslutningen.
