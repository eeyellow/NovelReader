const CACHE_NAME = "novel-reader-v2";
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

// Fetch: Offline-First & Stale-While-Revalidate strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // 1. API routes: Network-first with fast timeout & offline fallback response
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const networkResponse = await fetch(request, { signal: controller.signal });
          clearTimeout(timeoutId);
          return networkResponse;
        } catch {
          // Return graceful offline fallback JSON
          return new Response(
            JSON.stringify({ success: false, offline: true, books: [] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      })()
    );
    return;
  }

  // 2. HTML Navigation requests (e.g. /, /reader/xxx)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request);

        const networkFetchPromise = fetch(request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === "basic"
            ) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => null);

        // If we have cached HTML, return immediately for instant offline load
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise wait for network or fallback to app shell "/"
        const networkResponse = await networkFetchPromise;
        if (networkResponse) {
          return networkResponse;
        }

        const appShell = await caches.match("/");
        if (appShell) {
          return appShell;
        }

        return new Response("離線模式，請連線後再試", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })()
    );
    return;
  }

  // 3. Static assets (_next/static, chunks, fonts, icons, css, js): Cache-First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
