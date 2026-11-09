"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button className="btn" type="button" onClick={async () => {
      // Listan sparas i telefonen för offline-bruk; den ska inte ligga kvar efter utloggning.
      try { localStorage.removeItem("lists-v1"); } catch { /* blockerad lagring */ }
      await authClient.signOut(); router.replace("/logga-in"); router.refresh(); }}>
      Logga ut
    </button>
  );
}
