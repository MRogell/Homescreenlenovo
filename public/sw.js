// Cachar bara en allowlist av publika filer och /offline. Aldrig /api, inloggade sidor eller personuppgifter.
const CACHE = "hemskarm-v1";
const ALLOW = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ALLOW)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline")));
    return;
  }
  if (ALLOW.includes(url.pathname)) e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
