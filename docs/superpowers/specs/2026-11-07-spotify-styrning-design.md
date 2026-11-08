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

## Enhetslistan visar allt Spotify returnerar (ägarens önskemål: saknade Connect-enheter)
- Tidigare dolde appen tyst enheter som Spotify märkt `is_restricted` (och enheter utan id). Nu visas allt `GET /me/player/devices` returnerar.
  Det som inte går att styra visas nedtonat med "Kan inte styras härifrån", så att man ser *varför* en enhet inte går att välja. Den automatiska reservvägen
  vid "spela" utan aktiv enhet väljer fortfarande bara styrbara enheter.
- Flytt till en begränsad enhet ger felet `restricted_device` ("Starta uppspelningen i Spotify-appen och välj enheten där").
- Enheter som Spotifys moln inte känner till (t.ex. Sonos-högtalare som inte nyligen spelat via Spotify) syns inte alls: Spotify-appen hittar dem lokalt på wifi
  (Spotify Connect via mDNS), vilket inte går från en webbserver. Listan säger det. Det som ger rumsstyrning är Sonos egen koppling (utvecklarapp hos Sonos).

## Felsökning: spela fungerar inte (2026-11-08)
- **Bevisat fel i appen (rättat):** efter ett tryck på spela/pausa visades det tillfälliga läget tills servern *ändrade* läge. Tog Spotify emot kommandot utan att något började spela
  stod knappen kvar på "Pausa" medan pillret sa "Pausad". Nu släpps det tillfälliga läget när servern har svarat, oavsett svar. Enhetsbyte använder det verkliga läget (`playing`), inte det tillfälliga.
- **Oförklarat fel (instrumenterat):** "Spotify kunde inte utföra kommandot" döljer Spotifys verkliga svar. Oväntade fel visar nu status, orsaksord och en kort felrad (t.ex. "502, UNKNOWN, Restriction violated")
  och loggas på servern (bara status och orsak). Texten saneras och Spotifys felrad rensas från vår token innan den visas.
- Nästa steg är att läsa den verkliga orsaken och rätta därefter, inte att gissa.

## Rotorsak hittad: "403 Restricted device" (2026-11-08)
Instrumenteringen visade Spotifys verkliga svar: `403, Restricted device` för den aktiva enheten (ägarens iPhone). Spotify vägrar kommandon till den enheten;
det är dokumenterat för Sonos och förekommer för andra enheter. Appen kände bara igen orsaken som kod (`RESTRICTED_DEVICE`), men Spotify skickade den som text.
- Känns nu igen både som kod och text. "Restriction violated" (t.ex. pausa när redan pausat) får egen text (`not_now`).
- Spotify-kortet läser `is_restricted`, `supports_volume` och `volume_percent` för den aktiva enheten. Begränsad enhet: inga döda knappar, en förklaring och "Byt enhet".
  Vägrar Spotify ett kommando trots att enheten inte är märkt, minns kortet det för enheten tills musiken byter enhet.
- **Volym:** reglage när Spotify tillåter det (`PUT /me/player/volume?volume_percent=`), ett kommando när man släppt (300 ms). Annars en förklaring
  (iOS och telefonappar tillåter enligt flera rapporter inte fjärrstyrd volym).
- **Fördröjning:** `GET /api/spotify/now` hämtar läget direkt från Spotify (ingen cache). Kortet frågar var 4:e sekund när skärmen är synlig och 400 ms efter kommandon.
- **Begränsning som kvarstår:** Sonos-rum syns inte i Spotifys Web API (lokal upptäckt, och Sonos är begränsade). De styrs via Sonos egen koppling.
