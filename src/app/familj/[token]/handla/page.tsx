import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ShoppingMode } from "@/components/lists/shopping-mode";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db";
import { findShare } from "@/server/share/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handla", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

/** Butiksläget för en familjemedlem. Sidan innehåller ingen listdata, så den kan ligga i telefonens cache och öppnas utan täckning. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findShare(token, db, getEnv().BETTER_AUTH_SECRET))) notFound();
  return (
    <div className="wrap shop">
      <header className="top-bar page-bar">
        <Link className="icon-btn" href={`/familj/${token}`} aria-label="Tillbaka till listan"><ArrowLeft aria-hidden="true" /></Link>
        <h1>Handla</h1>
      </header>
      <main className="landmark">
        <section className="card" aria-label="Inköpslista">
          <ShoppingMode endpoint={`/api/share/${token}/lists`} storeKey={`lists-share-${token.slice(0, 10)}`} />
        </section>
      </main>
    </div>
  );
}
