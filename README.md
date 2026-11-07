# Hemskärm
Familjens smarta hem på en skärm (Lenovo P12, liggande): Škoda, Sonos, Spotify, Plejd, Tado, Tapo, AEG och Arlo.
Helt separat app. Teknik: Next.js 16, Tailwind 4, Prisma 7 + PostgreSQL, Better Auth, Zod, Vitest.

Etapp 1 (denna): inloggning, databas, hemskärm med demodata för alla åtta tjänster, PWA, CI.
Därefter: Sonos och Spotify, sedan Tado/Škoda/Arlo, sist AEG/Plejd/Tapo (se `docs/superpowers/specs`).

Köra lokalt: `docs/LOKALT.md`. Driftsättning på Render: `docs/DRIFT.md`.
Kontroller: `npm run typecheck && npm run lint && npm test`.
