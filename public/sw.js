// Cachar bara en allowlist av publika filer och /offline. Aldrig /api, inloggade sidor eller personuppgifter.
const CACHE = "hemskarm-v1";
// Handlalägets skal (sidan innehåller ingen listdata, den hämtas i webbläsaren) och apparnas oföränderliga filer, så att /handla går att öppna utan täckning.
const SHELL = "hemskarm-handla-v1";
const STATIC = "hemskarm-static-v1";
const KEEP = [CACHE, SHELL, STATIC];
const ALLOW = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ALLOW)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (e.request.mode === "navigate" && (url.pathname === "/handla" || /^\/familj\/[^/]+(\/handla)?$/.test(url.pathname))) {
    // Nätet först. Lyckas det sparas skalet; annars används det sparade. Omdirigeringar (utloggad) sparas aldrig.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(url.pathname, copy)); }
          return res;
        })
        .catch(() => caches.open(SHELL).then((c) => c.match(url.pathname)).then((r) => r || caches.match("/offline"))),
    );
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline")));
    return;
  }
  // Next.js egna filer har namn efter innehållet och ändras aldrig: cache först.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(STATIC).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (ALLOW.includes(url.pathname)) e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

// Notiser (Web Push). iOS kräver att varje push visar en notis, så vi visar alltid något.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* ogiltig data: visa standardtext */ }
  const title = typeof d.title === "string" && d.title ? d.title : "Hemskärmen";
  e.waitUntil(self.registration.showNotification(title, {
    body: typeof d.body === "string" ? d.body : "",
    tag: typeof d.tag === "string" ? d.tag : undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const open = cs.find((c) => new URL(c.url).origin === self.location.origin);
    return open ? open.focus() : self.clients.openWindow("/");
  }));
});
