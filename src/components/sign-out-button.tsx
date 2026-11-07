"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button className="btn" type="button" onClick={async () => { await authClient.signOut(); router.replace("/logga-in"); router.refresh(); }}>
      Logga ut
    </button>
  );
}
