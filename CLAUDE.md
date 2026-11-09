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

## Design: förhandsvisa först, pusha sedan när det är klart
Ägaren vill kunna välja och justera design utan att varje ändring blir ett Vercel-bygge.
- Visa designförslag som en förhandsvisning (en privat sida, ingen push) och låt ägaren välja.
- När ägaren valt: bygg och testa lokalt och **pusha när ändringen är klar** (se nedan).

## Pusha alltid när något är klart
Ägarens beslut: när en ändring är färdig och testad ska den pushas direkt, utan att ägaren behöver säga "lägg ut".
- "Klart" betyder en färdig ändring, inte varje liten justering: samla småsaker och pusha en gång per färdig ändring (Vercels byggengräns gäller fortfarande).
- Kör typkontroll, lint, tester och bygge lokalt först. Pusha inte om något är rött.
- Pusha till både grenen och `main` (`git push origin <gren>:main`).
- Pusha inte halvfärdigt arbete eller något ägaren bett att få förhandsvisa först.
- Efter pushen: kontrollera Vercels status på commiten själv (`gh api repos/MRogell/homescreenlenovo/commits/<sha>/status`, båda projekten) tills den är klar.
- **Säg bara till ägaren om Vercel inte kan lägga ut** (status error/failure, till exempel byggfel eller nådd byggengräns), med orsaken och vad som behövs. Är allt Ready: säg ingenting om utlägget.

@AGENTS.md
