const CACHE = "gwa-cliente-v2";
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");
const ASSETS = [BASE + "/", BASE + "/index.html", BASE + "/manifest.json", BASE + "/logo.svg", BASE + "/pago-exitoso.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
