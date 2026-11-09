import { notFound } from "next/navigation";
import { GuestLists } from "@/components/lists/guest-lists";
import { getEnv } from "@/lib/env";
import { findShare } from "@/server/share/store";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Familjens lista", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

/** Familjemedlemmens sida: inköpslista och lappar. Ingen inloggning, bara den hemliga länken. Inget annat i appen nås härifrån. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const who = await findShare(token, db, getEnv().BETTER_AUTH_SECRET);
  if (!who) notFound();
  return (
    <div className="wrap shop">
      <header className="top-bar page-bar">
        <h1>Hej {who.name}</h1>
      </header>
      <main className="landmark">
        <section className="card" aria-label="Familjens lista">
          <GuestLists token={token} />
        </section>
      </main>
    </div>
  );
}
