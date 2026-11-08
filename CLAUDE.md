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

## Design: förhandsvisa först, lägg ut sist
Ägaren vill kunna välja och justera design utan att varje ändring blir ett Vercel-bygge.
- Visa designförslag som en förhandsvisning (en privat sida, ingen push) och låt ägaren välja.
- När ägaren valt: bygg och testa lokalt, men **pusha inte** förrän ägaren uttryckligen säger att det ska läggas ut. Att välja en variant betyder inte "lägg ut".
- Samla flera ändringar i en enda push.

@AGENTS.md
