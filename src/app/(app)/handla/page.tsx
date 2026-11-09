import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ShareSheet } from "@/components/lists/share-sheet";
import { ShoppingMode } from "@/components/lists/shopping-mode";
import { requireUser } from "@/server/authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handla" };

/**
 * Handlaläget: stor vy av inköpslistan för butiken. Sidan innehåller ingen listdata och inga länkar (de hämtas i webbläsaren),
 * så att den kan ligga i telefonens cache och öppnas även utan täckning inne i butiken.
 */
export default async function Page() {
  await requireUser();
  return (
    <div className="wrap shop">
      <header className="top-bar page-bar">
        <Link className="icon-btn" href="/" aria-label="Till hemskärmen"><ArrowLeft aria-hidden="true" /></Link>
        <h1>Handla</h1>
        <ShareSheet />
      </header>
      <main className="landmark">
        <section className="card" aria-label="Inköpslista">
          <ShoppingMode />
        </section>
      </main>
    </div>
  );
}
