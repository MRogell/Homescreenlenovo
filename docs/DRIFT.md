# Driftsättning på Render
Render (PostgreSQL) är första valet för databas.

1. **Databas:** skapa en PostgreSQL på Render. Den kostnadsfria planen **går ut 30 dagar efter att den skapats** och raderas efter 14 dagars frist
   (kontrollera Renders aktuella villkor). För data som ska bevaras: betald plan eller regelbundna säkerhetskopior med `pg_dump`.
2. **`DATABASE_URL`:** använd Renders externa adress och lägg `?sslmode=require` sist.
3. **Webbtjänst:** Node 22. Build: `npm install && npm run build`. Start: `npx prisma migrate deploy && npm start`.
4. **Miljövariabler:** `DATABASE_URL`, `BETTER_AUTH_SECRET` (minst 32 tecken, samma värde krypterar tjänstetokens: byts den måste anslutningar göras om),
   `BETTER_AUTH_URL` (publik https-adress).
5. **Plattan:** öppna adressen i Chrome på Lenovo P12, välj *Lägg till på startskärmen*. Appen startar i liggande helskärm.
6. **Säkerhetskopia:** `pg_dump "$DATABASE_URL" > hemskarm.sql` regelbundet.
