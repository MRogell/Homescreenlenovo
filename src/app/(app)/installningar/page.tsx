import Link from "next/link";
import { requireUser } from "@/server/authz";
import { getConnectionStatus } from "@/server/connections";
import { getOAuthConfig, isOAuthProvider, type OAuthProviderId } from "@/server/oauth-providers";
import { PROVIDERS } from "@/server/providers";
import { DisconnectButton } from "@/components/disconnect-button";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inställningar" };

const NAMES: Record<string, string> = { skoda: "Škoda", sonos: "Sonos", spotify: "Spotify", aeg: "AEG", arlo: "Arlo" };
const ERRORS: Record<string, string> = {
  "ogiltig-state": "Anslutningen avbröts av säkerhetsskäl. Försök igen från början.",
  avbrutet: "Du avbröt anslutningen.",
  "saknar-kod": "Tjänsten skickade ingen kod. Försök igen.",
  "saknar-konfiguration": "Tjänsten är inte konfigurerad på servern (klient-id och hemlighet saknas).",
  misslyckades: "Det gick inte att ansluta. Försök igen om en stund.",
};

async function oauthRow(id: OAuthProviderId) {
  const status = await getConnectionStatus(id);
  const configured = getOAuthConfig(id) !== null;
  return { id, status, configured };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const oauth = new Map((await Promise.all((["sonos", "spotify"] as const).map(oauthRow))).map((r) => [r.id, r]));
  const notice = sp.tjanst && NAMES[sp.tjanst] ? (sp.ok ? `${NAMES[sp.tjanst]} är ansluten.` : sp.fel ? (ERRORS[sp.fel] ?? "Något gick fel.") : null) : null;
  return (
    <div className="wrap">
      <header className="top-bar"><div><h1>Inställningar</h1><div className="sub">Inloggad som {user.email}</div></div><Link className="link" href="/">← Hemskärmen</Link></header>
      {notice && <p className={sp.ok ? "mid" : "err"} role="status">{notice}</p>}
      <section className="card" aria-label="Anslutningar">
        <div className="card-head"><span className="name">Anslutningar</span></div>
        <div className="rows">
          {await Promise.all(PROVIDERS.map(async (p) => {
            const name = NAMES[p.id] ?? p.id;
            const o = isOAuthProvider(p.id) ? oauth.get(p.id) : undefined;
            if (!o) {
              // Tjänster utan OAuth: visar bryggans status om de har en, annars demodata.
              const label = p.isConnected ? ((await p.isConnected()) ? "Ansluten via brygga" : "Saknar konfiguration") : p.connected === false ? "Ej ansluten" : "Demodata";
              return <div className="row" key={p.id}><span>{name}</span><span>{label}</span></div>;
            }
            const label = !o.configured && o.status !== "ok" ? "Saknar konfiguration" : o.status === "ok" ? "Ansluten" : o.status === "reauth" ? "Anslut igen" : "Ej ansluten";
            return (
              <div className="row" key={p.id} style={{ alignItems: "center", flexWrap: "wrap" }}>
                <span>{name}</span>
                <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span>{label}</span>
                  {o.status === "ok" ? <DisconnectButton provider={p.id} label={name} /> : o.configured ? <a className="btn" href={`/api/connect/${p.id}`}>{o.status === "reauth" ? "Anslut igen" : "Anslut"}</a> : null}
                </span>
              </div>
            );
          }))}
        </div>
      </section>
      <section className="card" aria-label="Konto">
        <div className="card-head"><span className="name">Konto</span></div>
        <SignOutButton />
      </section>
    </div>
  );
}
