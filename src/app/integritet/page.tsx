export const metadata = { title: "Integritetspolicy", description: "Hur Hemskärm hanterar uppgifter.", robots: { index: true, follow: true } };

/** Integritetspolicy. Publik (kräver ingen inloggning), eftersom Google Play kräver en adress till den. */
export default function Page() {
  return (
    <div className="wrap shop">
      <header className="top-bar page-bar"><h1>Integritetspolicy</h1></header>
      <main className="landmark prose">
        <p>Hemskärm är en privat app för en familjs hemskärm. Den är inte öppen för allmänheten och har ett enda konto.</p>

        <h2>Vilka uppgifter som sparas</h2>
        <ul>
          <li><b>Inloggning:</b> e-postadress och ett lösenord (sparas bara som en envägskrypterad kod).</li>
          <li><b>Kopplade tjänster:</b> åtkomstnycklar till de tjänster ägaren själv kopplar (till exempel Spotify, Sonos, Tado, AEG och bilens tjänst). De sparas krypterade och används bara för att hämta och styra just dessa tjänster.</li>
          <li><b>Familjens data:</b> inköpslista, lappar, middagsplan, recept, vem som hämtar, timers och inställningar.</li>
          <li><b>Plats:</b> vald ort för vädret. Appen läser inte enhetens plats.</li>
          <li><b>Notiser:</b> en teknisk adress till enheten om du slår på notiser.</li>
        </ul>

        <h2>Hur uppgifterna används</h2>
        <p>Uppgifterna används bara för att visa hemskärmen och skicka de notiser du själv valt. De säljs eller delas inte med någon, och appen innehåller ingen reklam och ingen spårning.</p>

        <h2>Tredje part</h2>
        <p>Appen hämtar väder (Open-Meteo och SMHI), och data från de tjänster ägaren kopplat. Hosting och databas ligger hos Vercel respektive en databasleverantör inom EU eller USA.</p>

        <h2>Radering</h2>
        <p>Ägaren kan koppla bort tjänster och ta bort familjelänkar under Inställningar. Vill du att alla uppgifter raderas, kontakta kontoägaren.</p>

        <h2>Kontakt</h2>
        <p>Frågor om integritet går till kontoägaren som driver appen.</p>
      </main>
    </div>
  );
}
