"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { classifySupport, readEnv, urlBase64ToBytes, type PushSupport } from "@/lib/push-client";
import type { AppSettings, NotifyKind, NotifyPrefs } from "@/lib/settings";

const KINDS: { id: NotifyKind; label: string; hint: string }[] = [
  { id: "aegDone", label: "Maskinen är klar", hint: "Diskmaskinen eller tvättmaskinen har blivit färdig." },
  { id: "carCharged", label: "Bilen är laddad", hint: "Laddningen har slutat, med batterinivån." },
  { id: "carUnlockedNight", label: "Bilen står olåst på natten", hint: "En gång per natt, mellan 22 och 06." },
  { id: "chargeReminder", label: "Laddpåminnelse", hint: "På kvällen om bilen har lågt batteri och inte laddar." },
  { id: "timer", label: "Timern gick av", hint: "När äggklockan eller en timer är klar." },
  { id: "preheat", label: "Förvärmningen startade", hint: "När klimatet startat inför din avresa." },
];

const noSubscribe = () => () => {};
// En enda sträng som läsvärde: useSyncExternalStore kräver ett stabilt värde mellan anrop.
const readSupport = (): PushSupport => classifySupport(readEnv());

async function post(method: "POST" | "DELETE", url: string, body?: object): Promise<{ ok: boolean; error?: string; json?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, error: typeof json?.error === "string" ? json.error : undefined, json: json ?? undefined };
  } catch {
    return { ok: false, error: "Ingen kontakt med servern." };
  }
}

/** Notiser till telefonen: slå på för den här enheten, välj vad som ska ge en notis och skicka en provnotis. */
export function NotificationSettings({ initial }: { initial: NotifyPrefs }) {
  const support = useSyncExternalStore(noSubscribe, readSupport, () => null);
  const [on, setOn] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  // Är den här enheten redan prenumerant? Svaret kommer asynkront från webbläsaren.
  useEffect(() => {
    if (support !== "ready" && support !== "denied") return;
    let alive = true;
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => { if (alive) setOn(!!s); }).catch(() => { if (alive) setOn(false); });
    return () => { alive = false; };
  }, [support]);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      // Behörighet måste frågas direkt i klicket, annars blockerar iOS den.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notiser är inte tillåtna. Tillåt dem i telefonens inställningar för Hemskärm.");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error("Appen är inte redo än. Ladda om sidan och försök igen.");
      const key = await fetch("/api/notifications/key", { cache: "no-store" }).then((r) => r.json()) as { publicKey?: string };
      if (!key.publicKey) throw new Error("Det gick inte att hämta nyckeln.");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key.publicKey) }));
      const r = await post("POST", "/api/notifications", sub.toJSON());
      if (!r.ok) { await sub.unsubscribe().catch(() => {}); throw new Error(r.error ?? "Det gick inte att slå på."); }
      setOn(true);
      setMsg({ text: "Notiser är på för den här enheten.", bad: false });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Det gick inte att slå på notiser.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) {
        await post("DELETE", "/api/notifications", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setOn(false);
      setMsg({ text: "Notiser är av för den här enheten.", bad: false });
    } catch {
      setMsg({ text: "Det gick inte att stänga av.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(kind: NotifyKind, value: boolean) {
    const before = prefs;
    const next = { ...prefs, [kind]: value };
    setPrefs(next);
    setBusy(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notify: next }) });
      const j = (await res.json().catch(() => null)) as { settings?: AppSettings } | null;
      if (!res.ok || !j?.settings) throw new Error();
      setPrefs(j.settings.notify);
    } catch {
      setPrefs(before);
      setMsg({ text: "Ingen kontakt med servern. Ändringen sparades inte.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await post("POST", "/api/notifications/test");
    setMsg(r.ok ? { text: "Provnotis skickad.", bad: false } : { text: r.error ?? "Provnotisen kom inte fram.", bad: true });
    setBusy(false);
  }

  return (
    <section className="card notify" aria-label="Notiser">
      <div className="card-head"><span className="name">Notiser</span></div>
      {support === null && <p className="mid">Kontrollerar…</p>}
      {support === "ios-install" && (
        <>
          <p className="mid">På iPhone fungerar notiser när Hemskärm ligger på hemskärmen. Gör så här i Safari:</p>
          <ol className="nt-steps">
            <li>Tryck på <b>Dela</b>-knappen (rutan med pilen uppåt).</li>
            <li>Välj <b>Lägg till på hemskärmen</b> och tryck <b>Lägg till</b>.</li>
            <li>Öppna Hemskärm från ikonen och kom tillbaka hit för att slå på notiser. Kräver iOS 16.4 eller nyare.</li>
          </ol>
        </>
      )}
      {support === "unsupported" && <p className="mid">Den här webbläsaren stödjer inte notiser.</p>}
      {support === "denied" && <p className="err">Notiser är blockerade för Hemskärm. Tillåt dem i telefonens inställningar (Inställningar → Notiser → Hemskärm) och ladda om sidan.</p>}
      {support === "ready" && on !== null && (
        <>
          <button type="button" className={`btn${on ? " secondary" : ""} nt-main`} disabled={busy} onClick={() => void (on ? disable() : enable())}>
            {busy ? "Vänta…" : on ? "Stäng av på den här enheten" : "Slå på notiser"}
          </button>
          {on && <button type="button" className="btn secondary nt-main" disabled={busy} onClick={() => void test()}>Skicka provnotis</button>}
        </>
      )}
      <h2 className="ap-h">Vad ska ge en notis?</h2>
      <ul className="nt-kinds">
        {KINDS.map((k) => (
          <li key={k.id}>
            <label className="ap-show">
              <input type="checkbox" role="switch" checked={prefs[k.id]} disabled={busy} onChange={(e) => void toggle(k.id, e.target.checked)} />
              <span>{k.label}<small className="mid">{k.hint}</small></span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mid small">Valen gäller alla enheter som har notiser på.</p>
      <p className={msg?.bad ? "err" : "mid"} role={msg?.bad ? "alert" : "status"}>{msg?.text ?? " "}</p>
    </section>
  );
}
