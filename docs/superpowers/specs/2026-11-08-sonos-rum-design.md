# Hemskärm – Sonos-rum med styrning (design)
Ägarens önskemål: se alla Sonos-rum (t.ex. Vardagsrum, Kök, Barnrum) och styra dem från hemskärmen. Ändrar etapp 2:s beslut att Sonos är skrivskyddat.

## Beslut
- **Kortet** visar alla grupper (ett rum, eller flera ihopkopplade rum) i hushållet: rummets namn (koordinatorn, plus "+ Kök" för ihopkopplade),
  låt och artist, och knappar **spela/pausa** och **nästa** per rum. Grupper som spelar visas först. Kortet tar två kolumner.
- **Läsning** (scope `playback-control-all`, som redan begärs): `GET /households` → `GET /households/{id}/groups` (namn, spelare, `playbackState`)
  → per grupp parallellt `playbackMetadata` och `groupVolume`. Saknar en grupp `playbackState` frågas `/playback`. TTL 30 s.
- **Styrning:** `POST /api/control/sonos` med `{"action": "play"|"pause"|"next"|"previous", "groupId": "..."}` → Sonos
  `POST /groups/{groupId}/playback/play|pause|skipToNextTrack|skipToPreviousTrack`. Samma skydd som Spotify (session, Origin, strikt indata;
  grupp-id: bokstäver, siffror, `:`, `_`, `.`, `-`). Sonos-cachen och väntetiden rensas efter lyckat kommando.
- **Fel** på svenska: 401 → "Anslut Sonos igen", 404/410 → "Rummet finns inte längre" (grupper ändras när rum kopplas ihop),
  429 → "Sonos begränsar anropen", övrigt → "Sonos kunde inte utföra kommandot (finns det något att spela i rummet?)".

## Overifierat
Sonos sökvägar och fältnamn är skrivna från minnet och testade mot påhittade svar. Sonos utvecklarsidor nås inte från byggmiljön.
