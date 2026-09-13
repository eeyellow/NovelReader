/**
 * @file sw.js
 * @description PWA 離線 Service Worker，支援雙層快取、弱網超時回退、Reader App Shell 與 100% 離線冷啟動
 */

const CACHE_VERSION = "novel-reader-c4682b7-mtzn2xgz";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const READER_SHELL_KEY = "/__reader_shell__";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.svg",
];

// 安裝階段：預先快取核心資源（使用 cache: "reload" 繞過本地 HTTP 快取確保抓取最新內容）
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.all(
        PRECACHE_ASSETS.map((url) =>
          fetch(new Request(url, { cache: "reload" }))
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch((err) => console.warn(`Precache failed for ${url}:`, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// 啟動階段：清理過期版本的快取空間
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/**
 * 封裝帶超時限制的 fetch，避免弱網環境下掛起過久
 */
function fetchWithTimeout(request, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Network timeout"));
    }, timeoutMs);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// 請求攔截路由策略
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. 忽略非 GET 或跨域請求
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // 2. API 路由：強制 Network-Only，絕不偽造 200 回退，避免覆蓋 IndexedDB 正確內容
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 3. HTML 導航請求 (Navigation: /, /reader/xxx)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // 優先發送網路請求（帶 2.5 秒超時限制），獲取最新頁面
          const networkResponse = await fetchWithTimeout(request, 2500);
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const clone = networkResponse.clone();
            const shellClone = url.pathname.startsWith("/reader/") ? networkResponse.clone() : null;
            caches.open(RUNTIME_CACHE).then(async (cache) => {
              await cache.put(request, clone);
              // 若造訪的是閱讀器頁面，額外備份一份通用 Reader Shell 供其他書籍離線冷啟動
              if (shellClone) {
                await cache.put(READER_SHELL_KEY, shellClone);
              }
            }).catch((err) => console.warn("Cache put failed:", err));
          }
          return networkResponse;
        } catch {
          // 網路超時或完全斷網時，啟用快取回退流程
          const runtimeCache = await caches.open(RUNTIME_CACHE);
          const staticCache = await caches.open(STATIC_CACHE);

          // (A) 精準匹配當前請求 URL
          const exactMatch = await runtimeCache.match(request);
          if (exactMatch) {
            return exactMatch;
          }

          // (B) 若為閱讀器路由 (/reader/*)，回退至通用 Reader Shell
          if (url.pathname.startsWith("/reader/")) {
            const readerShell = await runtimeCache.match(READER_SHELL_KEY);
            if (readerShell) {
              return readerShell;
            }

            // 尋找快取中任意一個現有的 /reader/ 頁面作為 Shell
            const requests = await runtimeCache.keys();
            const anyReaderReq = requests.find((req) => new URL(req.url).pathname.startsWith("/reader/"));
            if (anyReaderReq) {
              const anyReaderResp = await runtimeCache.match(anyReaderReq);
              if (anyReaderResp) return anyReaderResp;
            }
          }

          // (C) 回退至書架首頁 App Shell
          const appShell = (await staticCache.match("/")) || (await runtimeCache.match("/"));
          if (appShell) {
            return appShell;
          }

          return new Response("離線模式，請確認該書籍已快取至本機後重新開啟", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // 4. Next.js 靜態資源 (_next/static/chunks, css, media): Cache-First
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response("", { status: 404 });
        }
      })
    );
    return;
  }

  // 5. 其他靜態資產與圖片 (icon.svg, manifest, fonts 等): Stale-While-Revalidate
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});

// 監聽來自頁面的溫熱暖機指令 (Warm-up App Shell)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "WARMUP_READER" && event.data.url) {
    const readerUrl = event.data.url;
    fetch(readerUrl)
      .then((res) => {
        if (res && res.status === 200) {
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(readerUrl, res.clone());
            cache.put(READER_SHELL_KEY, res.clone());
          });
        }
      })
      .catch((e) => console.warn("Warmup reader failed", e));
  }
});
