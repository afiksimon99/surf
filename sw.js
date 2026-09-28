/* Service worker: app shell cache-first, forecast API network-first with cached fallback. */
const VERSION = "gs-v2";
const SHELL = ["./", "index.html", "app.js", "engine.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
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
    // shell: stale-while-revalidate so updates arrive on the next open
    e.respondWith(caches.open(VERSION).then(c => c.match(e.request).then(m => {
      const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => m);
      return m || net;
    })));
  }
});
