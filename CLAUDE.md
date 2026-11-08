# Projektregler

## Språk
Prata alltid svenska med ägaren: i alla svar, frågor, sammanfattningar och förklaringar. Kod, commit-meddelanden och dokumentation skrivs också på svenska som i resten av projektet.

## Vercel: bara gratisplanen (Hobby)
Ägaren har bara gratisversionen av Vercel. Den tillåter ungefär 100 byggen per dygn, och när gränsen är nådd byggs inget nytt förrän den släpper.
Varje push startar byggen i två projekt (hemskärmen och Škoda-bryggan), och en push till både gren och main dubblar det.
- Samla ändringar och pusha **en gång per färdig ändring**, inte per liten justering. Pusha inte bara för dokumentation eller småfix.
- Kör typkontroll, lint, tester och bygge lokalt innan push, så att inga byggen går åt till rättelser.
- Föreslå aldrig lösningar som kräver en betald Vercel-plan.
- Om ägaren säger att något "inte syns": kontrollera först om Vercel har byggt senaste commiten (gränsen kan vara nådd).

@AGENTS.md
