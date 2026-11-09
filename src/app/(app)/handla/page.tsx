import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ShoppingMode } from "@/components/lists/shopping-mode";
import { requireUser } from "@/server/authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handla" };

/**
 * Handlaläget: stor vy av inköpslistan för butiken. Sidan innehåller ingen listdata (den hämtas i webbläsaren och sparas där),
 * så att den kan ligga i telefonens cache och öppnas även utan täckning inne i butiken.
 */
export default async function Page() {
  await requireUser();
  return (
    <div className="wrap shop">
      <header className="top-bar">
        <div><h1>Handla</h1><div className="sub">Bocka av medan du går. Fungerar även utan täckning.</div></div>
        <Link className="back-link" href="/"><ArrowLeft aria-hidden="true" />Hemskärmen</Link>
      </header>
      <main className="landmark">
        <section className="card" aria-label="Inköpslista">
          <ShoppingMode />
        </section>
      </main>
    </div>
  );
}
