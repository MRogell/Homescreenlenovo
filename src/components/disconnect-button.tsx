"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisconnectButton({ provider, label }: { provider: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <button
        className="btn"
        type="button"
        disabled={busy}
        aria-label={`Koppla från ${label}`}
        onClick={async () => {
          setBusy(true);
          setError(false);
          const res = await fetch(`/api/disconnect/${provider}`, { method: "POST" }).catch(() => null);
          setBusy(false);
          if (res?.ok) router.refresh();
          else setError(true);
        }}
      >
        {busy ? "Vänta…" : "Koppla från"}
      </button>
      {error && <span className="err" role="alert">Det gick inte att koppla från.</span>}
    </>
  );
}
