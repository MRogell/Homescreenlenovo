# Köra lokalt
Krav: Node 22+, PostgreSQL 16.
```bash
npm install
cp .env.example .env        # fyll i BETTER_AUTH_SECRET (openssl rand -base64 32)
npx prisma migrate deploy   # skapar tabeller (utveckling: npm run db:migrate)
npm run dev                 # http://localhost:3000
```
Första besöket visar "Skapa familjens konto". Därefter stängs registreringen (databasen tillåter högst ett konto).
Kontroller: `npm run typecheck && npm run lint && npm test`.
Plattan på hemmanätet: sätt `AUTH_TRUSTED_ORIGINS="http://<datorns-adress>:3000"` och öppna adressen i plattans webbläsare.

## Sonos och Spotify lokalt
Spotify tillåter inte `localhost` som redirect-adress. Sätt `BETTER_AUTH_URL="http://127.0.0.1:3000"`, öppna appen på `http://127.0.0.1:3000`
och registrera `http://127.0.0.1:3000/api/connect/spotify/callback` hos Spotify. Se `docs/DRIFT.md` för resten.
