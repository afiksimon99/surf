/* Service worker: app files network-first (revalidated, so updates show on next open), cache fallback offline.
 * Forecast API: network-first with cached fallback. Fonts: cache-first. */
const VERSION = "gs-v3";
const SHELL = ["./", "index.html", "app.js", "engine.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname.endsWith("open-meteo.com")) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION + "-api").then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request)));
    return;
  }
  if (url.hostname.includes("fonts.g")) {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION + "-fonts").then(x => x.put(e.request, c)); return r; })));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match("index.html"))));
  }
});
