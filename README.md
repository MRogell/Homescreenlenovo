# Hemskärm
Familjens smarta hem på en skärm (Lenovo P12, liggande): Škoda, Sonos, Spotify, AEG och Arlo.
Helt separat app. Teknik: Next.js 16, Tailwind 4, Prisma 7 + PostgreSQL, Better Auth, Zod, Vitest.

Etapp 1: inloggning, databas, hemskärm med demodata för alla åtta tjänster, PWA, CI.
Etapp 2: Sonos och Spotify med riktig data via OAuth (anslut i Inställningar). Spotify kan styras (spela/pausa/byt låt, byt enhet). Sonos visar alla rum med spela/pausa och nästa per rum.
Etapp 3 (påbörjad): Škoda via Python-brygga (`skoda_bridge/`, skrivskyddad). Ännu inte driftsatt, se `docs/SKODA.md`. Väder och luftkvalitet från Open-Meteo. Inomhustemperaturer från Tado (anslut i Inställningar). Plejd och Tapo visas inte (Plejd kräver lokal Bluetooth); AEG-diskmaskinen via Electrolux utvecklar-API (anslut i Inställningar). Kvar med demodata: Arlo. Kvar: Arlo och AEG (se `docs/superpowers/specs`).

Köra lokalt: `docs/LOKALT.md`. Driftsättning (Vercel + Render PostgreSQL): `docs/VERCEL.md`. Tjänsteanslutningar: `docs/DRIFT.md`.
Kontroller: `npm run typecheck && npm run lint && npm test`.
