const CACHE_NAME = "htbf-cache-v2";

const STATIC_ASSETS = [
  "/images/icons/icon-192.png",
  "/images/icons/icon-512.png",
  "/images/htbf-logo.png",
  "/images/hero-freedom.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  // Do not intercept Supabase, auth, storage, or video/media requests.
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("story-videos") ||
    request.destination === "video" ||
    request.destination === "audio" ||
    request.destination === "document"
  ) {
    return;
  }

  // Only cache basic static image/icon assets.
  if (
    request.destination === "image" ||
    url.pathname.startsWith("/images/icons/")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return (
          cachedResponse ||
          fetch(request).then((networkResponse) => {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          })
        );
      })
    );
  }
});
