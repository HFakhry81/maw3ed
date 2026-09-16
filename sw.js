const CACHE = "maw3ed-shell-v2";
const PRECACHE = ["/", "/book.html", "/manifest.webmanifest", "/assets/maw3ed-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Skip API, Vite HMR, and module graph — never cache those.
  if (
    url.port === "7100" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.includes("vite") ||
    url.searchParams.has("t")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") return response;
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached)
    )
  );
});
