# Hemskärm
Familjens smarta hem på en skärm (Lenovo P12, liggande): Škoda, Sonos, Spotify, Plejd, Tado, Tapo, AEG och Arlo.
Helt separat app. Teknik: Next.js 16, Tailwind 4, Prisma 7 + PostgreSQL, Better Auth, Zod, Vitest.

Etapp 1: inloggning, databas, hemskärm med demodata för alla åtta tjänster, PWA, CI.
Etapp 2: Sonos och Spotify med riktig data via OAuth (anslut i Inställningar). Spotify kan styras (spela/pausa/byt låt).
Etapp 3 (påbörjad): Škoda via Python-funktion i samma projekt (`api/skoda.py`, skrivskyddad, se `docs/SKODA.md`). Därefter Tado och Arlo, sist AEG/Plejd/Tapo (se `docs/superpowers/specs`).

Köra lokalt: `docs/LOKALT.md`. Driftsättning (Vercel + Render PostgreSQL): `docs/VERCEL.md`. Tjänsteanslutningar: `docs/DRIFT.md`.
Kontroller: `npm run typecheck && npm run lint && npm test`.
