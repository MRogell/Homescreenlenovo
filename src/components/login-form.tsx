"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ canRegister }: { canRegister: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    const res = canRegister
      ? await authClient.signUp.email({ email, password, name: email.split("@")[0] ?? "Familjen" })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) setError(canRegister ? "Det gick inte att skapa kontot. Lösenordet måste vara minst 10 tecken." : "Fel e-postadress eller lösenord.");
    else { router.replace("/"); router.refresh(); }
  }

  return (
    <main className="landmark">
      <form className="form" onSubmit={onSubmit}>
        <h1>{canRegister ? "Skapa familjens konto" : "Logga in"}</h1>
        {canRegister && <p className="sub">Första kontot blir det enda: därefter stängs registreringen.</p>}
        <label htmlFor="email">E-post<input id="email" name="email" type="email" autoComplete="username" required /></label>
        <label htmlFor="password">Lösenord<input id="password" name="password" type="password" autoComplete={canRegister ? "new-password" : "current-password"} minLength={canRegister ? 10 : undefined} required /></label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Vänta…" : canRegister ? "Skapa konto" : "Logga in"}</button>
      </form>
    </main>
  );
}
