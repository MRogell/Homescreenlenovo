# Google Home på hemskärmen
Plejd, Tado och Tapo visas inte som egna kort (de hade bara demodata). I stället finns en stor **Google Home-ruta** som öppnar Google Home.

## Varför inte inbäddat?
Google Home kan inte visas inuti hemskärmen: Googles inloggade sidor tillåter i regel inte inbäddning, och webbläsaren blockerar inloggning i en inbäddad ruta.
Google har heller inget webb-API som låter hemskärmen läsa till exempel Plejd-lampor: molnvägen (Home Graph) är för tillverkarens egen tjänst,
och Home APIs kräver en egen Android- eller iOS-app.

## Vad rutan gör
- **Plattan (Android):** "Öppna Google Home" startar Google Home-appen via en Android-länk (via Play Butiken). Finns inte appen öppnas webbversionen.
  "Webbversion" öppnar `home.google.com`. Länken till appen är inte provad på plattan härifrån.
- **Andra enheter:** knappen öppnar `home.google.com`.

## Hemskärm och Google Home sida vid sida (Lenovo P12)
Android kan visa två appar samtidigt:
1. Öppna Hemskärm (startskärmsikonen).
2. Öppna översikten över senaste appar (svep upp från nederkanten och håll, eller tryck på fyrkanten).
3. Tryck på Hemskärms ikon överst på kortet och välj **Delad skärm**.
4. Välj **Google Home** som den andra appen. Dra i mittlisten för att ändra storlek.
Exakta menynamn kan skilja sig mellan Android-versioner.
