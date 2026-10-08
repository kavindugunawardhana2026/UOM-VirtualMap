// Offline support: app files are cached on first visit, map tiles as you browse.
const APP = "campus-app-v1";
const TILES = "campus-tiles-v1";
const APP_FILES = [
  "./", "index.html", "css/app.css", "js/app.js", "js/router.js", "js/places.js", "js/campus-data.js",
  "manifest.webmanifest",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const isTile = /tile\.openstreetmap\.org|arcgisonline\.com/.test(url.hostname);
  if (isTile) {
    // Cache-first for tiles the user has already seen.
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === "opaque") c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // Network-first for app files and photos so edits show up, cache as fallback.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com")) {
      const copy = res.clone();
      caches.open(APP).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
