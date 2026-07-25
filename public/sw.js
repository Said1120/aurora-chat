const CACHE = "aurora-chat-v3";
const BASE = "/aurora-chat/";
const ASSETS = [BASE, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`];
const STATIC_DESTINATIONS = new Set([
  "audio",
  "document",
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "video",
  "worker",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE) ||
    !STATIC_DESTINATIONS.has(event.request.destination)
  ) return;
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => caches.match(BASE)),
    ),
  );
});
