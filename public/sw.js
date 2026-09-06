const CACHE_NAME = "novel-reader-v3";
const STATIC_ASSETS = ["/", "/manifest.json", "/icon.svg"];

// Install: Precache shell and static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up older cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Strategy routing
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // 1. API routes: Direct network-only.
  // DO NOT fake status 200 offline fallback for APIs, as /api/books/[id]/content returns raw text!
  // Faking 200 JSON causes raw novel text to be overwritten by fallback JSON strings in IndexedDB.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. HTML Navigation requests (e.g. /, /reader/xxx)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Network first for fresh navigation
          const networkResponse = await fetch(request);
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        } catch {
          // Fallback to cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }

          const appShell = await caches.match("/");
          if (appShell) {
            return appShell;
          }

          return new Response("離線模式，請確認網路連線或已將小說快取至本機", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // 3. Static assets (_next/static, chunks, fonts, icons, css, js): Cache-First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === "basic"
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      });
    })
  );
});
