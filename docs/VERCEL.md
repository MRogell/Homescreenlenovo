# Driftsätta på Vercel (webbappen) med Render PostgreSQL (databasen)
Webbappen körs på Vercel. Databasen är Render PostgreSQL (projektregel: Render är första valet för databas).

## 1. Databas på Render
1. render.com → **New → PostgreSQL**. Region **Frankfurt**. Namn t.ex. `hemskarm-db`.
2. **Gratisdatabasen går ut 30 dagar efter att den skapats** och raderas efter 14 dagars frist (kontrollera Renders aktuella villkor).
   Välj en **betald** plan för data du vill behålla, eller ta regelbundna säkerhetskopior med `pg_dump`.
3. När den är klar: öppna databasen och kopiera **External Database URL**. Lägg `?sslmode=require` sist.
   Exempel: `postgresql://user:pass@dpg-xxxx.frankfurt-postgres.render.com/hemskarm?sslmode=require`
4. Under **Access Control** (Inbound IP Rules) måste Vercels anrop släppas in. Vercel har inga fasta IP-adresser, så tillåt `0.0.0.0/0`.
   Anslutningen skyddas av lösenord och SSL.

## 2. Projekt på Vercel
1. vercel.com → **Add New → Project** → välj GitHub-repon `MRogell/Homescreenlenovo` (ge Vercel åtkomst till den om den frågar).
2. **Framework Preset:** Next.js (väljs automatiskt).
   **Production Branch:** repon har ännu ingen `main`: all kod ligger på grenen `claude/determined-meitner-uyhstd`.
   Skriv den grenen som Production Branch (Settings → Environments → Production → Branch Tracking), eller be om att koden läggs på `main` först.
3. **Environment Variables** (Production):

   | Namn | Värde |
   |---|---|
   | `DATABASE_URL` | Renders External URL med `?sslmode=require` |
   | `BETTER_AUTH_SECRET` | minst 32 tecken, t.ex. från `openssl rand -base64 32`. Krypterar även tjänstetokens: byts den måste Sonos och Spotify anslutas om. |
   | `BETTER_AUTH_URL` | appens fasta adress, t.ex. `https://hemskarm.vercel.app` (utan snedstreck sist) |
   | `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | från Spotify-appen |
   | `SONOS_CLIENT_ID` / `SONOS_CLIENT_SECRET` | från Sonos-integrationen |

   Spotify och Sonos kan läggas till senare. Utan dem visar Inställningar "Saknar konfiguration".
4. **Deploy.** Bygget kör `prisma migrate deploy` mot Render (bara i Production) och skapar tabellerna.
   Preview-bygge rör aldrig databasen.

## 3. Efter första driftsättningen
1. Öppna adressen. Första besöket visar **Skapa familjens konto**. Skapa kontot direkt: det första kontot blir det enda.
2. Registrera redirect-URI:erna hos Spotify och Sonos (se `DRIFT.md`) med din riktiga adress, t.ex.
   `https://hemskarm.vercel.app/api/connect/spotify/callback`. Adressen ska vara exakt likadan som `BETTER_AUTH_URL` plus sökvägen.
3. Logga in → **Inställningar** → **Anslut**.
4. **Plattan (Lenovo P12):** öppna adressen i Chrome → menyn ⋮ → **Lägg till på startskärmen**. Appen startar i liggande helskärm.

## Bra att veta
- **Fast adress:** `BETTER_AUTH_URL` måste vara den adress du faktiskt använder. Vid eget domännamn: ändra värdet och registrera om redirect-URI:erna.
- **Anslutningar till databasen:** varje Vercel-instans använder högst 3 (`DB_POOL_MAX`). Det räcker gott för en familj.
- **Säkerhetskopia:** `pg_dump "$DATABASE_URL" > hemskarm.sql` regelbundet (med den externa adressen).
- **Felsökning:** Vercel → projektet → **Logs**. "Ogiltig miljökonfiguration" betyder att en miljövariabel saknas eller är för kort.
  Ändrade miljövariabler gäller först efter en ny driftsättning (**Redeploy**).
