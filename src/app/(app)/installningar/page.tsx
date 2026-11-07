import Link from "next/link";
import { requireUser } from "@/server/authz";
import { PROVIDERS } from "@/server/providers";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inställningar" };

const NAMES: Record<string, string> = { skoda: "Škoda", sonos: "Sonos", spotify: "Spotify", plejd: "Plejd", tado: "Tado", tapo: "Tapo", aeg: "AEG", arlo: "Arlo" };

export default async function Page() {
  const user = await requireUser();
  return (
    <div className="wrap">
      <header className="top-bar"><div><h1>Inställningar</h1><div className="sub">Inloggad som {user.email}</div></div><Link className="link" href="/">← Hemskärmen</Link></header>
      <section className="card" aria-label="Anslutningar">
        <div className="card-head"><span className="name">Anslutningar</span></div>
        <p className="mid">Etapp 1 visar demodata. Riktiga anslutningar kommer i nästa etapper.</p>
        <div className="rows">
          {PROVIDERS.map((p) => (
            <div className="row" key={p.id}><span>{NAMES[p.id] ?? p.id}</span><span>{p.connected === false ? "Ej ansluten" : "Demodata"}</span></div>
          ))}
        </div>
      </section>
      <section className="card" aria-label="Konto">
        <div className="card-head"><span className="name">Konto</span></div>
        <SignOutButton />
      </section>
    </div>
  );
}
