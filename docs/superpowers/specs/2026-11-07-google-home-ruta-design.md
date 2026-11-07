> **Borttagen** på ägarens begäran (2026-11-08). Beslutet nedan gäller inte längre.

# Hemskärm – Google Home-ruta (design)
Ägarens beslut: Tado, Plejd och Tapo ersätts av en Google Home-ruta.

## Beslut
- Korten och demomodulerna för Tado, Plejd och Tapo tas bort (de visade bara påhittad data). `PROVIDER_IDS` är nu `skoda, sonos, spotify, aeg, arlo`.
- En Google Home-ruta tar resten av nedre raden (3 kolumner på bred skärm, 1 på smal). Den visar ingen egen data.
- Android (avgörs i webbläsaren efter montering): "Öppna Google Home" är en intent-länk via Play Butikens `launch?id=com.google.android.apps.chromecast.app`
  med `browser_fallback_url=https://home.google.com`, plus en separat knapp "Webbversion". Övriga enheter: bara webbversionen.
- Inbäddning är inte möjlig (se `docs/GOOGLE-HOME.md`). Tips om Androids delade skärm dokumenteras.

## Overifierat
Att intent-länken startar appen på plattan (provad bara som länk i webbläsare härifrån). Webbversionen är alltid tillgänglig som eget val.
