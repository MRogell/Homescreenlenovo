export type PushSupport = "unsupported" | "ios-install" | "denied" | "ready";

export interface Env {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  /** Appen är startad från hemskärmen (inte i Safari-fliken). */
  standalone: boolean;
  permission: "default" | "granted" | "denied" | null;
}

/** Vad webbläsaren klarar. På iPhone fungerar notiser bara när appen lagts till på hemskärmen (iOS 16.4+). */
export function classifySupport(e: Env): PushSupport {
  if (e.isIOS && !e.standalone) return "ios-install";
  if (!e.hasServiceWorker || !e.hasPushManager || !e.hasNotification) return "unsupported";
  if (e.permission === "denied") return "denied";
  return "ready";
}

/** VAPID-nyckeln kommer som base64url; pushManager.subscribe vill ha bytes. */
export function urlBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Läser miljön i webbläsaren. Bara i klienten. */
export function readEnv(): Env {
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    // iPadOS låtsas vara Mac: peksensorer skiljer den från en riktig Mac.
    isIOS: /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1),
    standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    permission: "Notification" in window ? Notification.permission : null,
  };
}
