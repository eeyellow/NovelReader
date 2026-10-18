/**
 * @file sw.js
 * @description PWA 離線閱讀 Service Worker（Pre-cache 雙殼層 + 導航超時回退 + 靜態資源快取）
 */

const CACHE_VERSION = "novel-reader-942d7f2-mvdi4w1d";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const READER_SHELL_KEY = "/__reader_shell__";
const SHELL_URLS = ["/", "/reader/__shell__"];
const NAV_TIMEOUT_MS = 3000;

const extractAssets = (html) => {
  const set = new Set();
  const re = /\/?_next\/static\/[^"'\s\\),<>]+/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[0].startsWith("/") ? m[0] : `/${m[0]}`;
    set.add(raw);
  }
  return [...set];
};

async function cacheHtmlAssets(staticsCache, html) {
  const assets = extractAssets(html);
  await Promise.allSettled(
    assets.map(async (assetUrl) => {
      const existing = await staticsCache.match(assetUrl);
      if (!existing) {
        await staticsCache.add(assetUrl);
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES_CACHE);
      const statics = await caches.open(STATIC_CACHE);

      for (const url of SHELL_URLS) {
        try {
          const res = await fetch(url, {
            cache: "no-store",
            credentials: "include",
          });
          if (!res.ok || res.redirected || res.type !== "basic") continue;
          const html = await res.clone().text();
          await pages.put(url === "/" ? "/" : READER_SHELL_KEY, res);
          await cacheHtmlAssets(statics, html);
        } catch (err) {
          console.warn(`[SW] Precache shell failed for ${url}:`, err);
        }
      }

      await Promise.allSettled(
        ["/manifest.json", "/icon.svg"].map((u) => statics.add(u))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const isRsc = (req, url) =>
  req.headers.get("RSC") === "1" ||
  req.headers.has("Next-Router-Prefetch") ||
  url.searchParams.has("_rsc");

const fetchWithTimeout = (req, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(
      (r) => {
        clearTimeout(t);
        resolve(r);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

const OFFLINE_HTML = `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>離線模式</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;background:#121214;color:#e4e4e7;text-align:center"><h3>目前處於離線狀態</h3><p style="color:#a1a1aa;font-size:0.9rem">尚未快取應用程式殼層，請在有網路時開啟一次即可啟用離線閱讀。</p></body></html>`;

async function handleNavigate(request, url) {
  try {
    const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (res.status >= 500) {
      throw new Error(`Server error ${res.status}`);
    }
    // Cloudflare Access 等 302 轉址登入頁不可快取
    if (res.ok && res.type === "basic" && !res.redirected) {
      const cloneForPage = res.clone();
      const cloneForAssets = res.clone();
      const key = url.pathname.startsWith("/reader/")
        ? READER_SHELL_KEY
        : url.pathname;
      caches
        .open(PAGES_CACHE)
        .then((cache) => cache.put(key, cloneForPage))
        .catch(() => {});
      Promise.all([caches.open(STATIC_CACHE), cloneForAssets.text()])
        .then(([statics, html]) => cacheHtmlAssets(statics, html))
        .catch(() => {});
    }
    return res;
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const hit =
      (url.pathname.startsWith("/reader/") &&
        (await cache.match(READER_SHELL_KEY))) ||
      (await cache.match(url.pathname, { ignoreSearch: true })) ||
      (await cache.match("/"));
    return (
      hit ||
      new Response(OFFLINE_HTML, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isRsc(request, url)) {
    if (request.headers.has("Next-Router-Prefetch")) {
      return;
    }
    // 對互動式 RSC 導航加上超時限制，避免弱網 (Lie-fi) 卡死，超時後讓 Next 立即退回 MPA 硬導航
    event.respondWith(
      fetchWithTimeout(request, NAV_TIMEOUT_MS).catch(
        () => new Response("", { status: 504 })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request, url));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit =
          (await cache.match(request)) ||
          (await cache.match(url.pathname, { ignoreSearch: true }));
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const net = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
