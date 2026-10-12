/* Service worker «Виртуального гардероба».
 * - Оболочка приложения: сеть в приоритете, при офлайне — кеш (страницы работают без интернета).
 * - Статика Next (/_next/static, хеши в именах): кеш в приоритете.
 * - Модель удаления фона (staticimgly.com или свой адрес): кешируется после первой загрузки,
 *   чтобы удалять фон и без сети.
 * Данные гардероба лежат в IndexedDB и в SW не участвуют.
 */
const VERSION = "v1";
const SHELL_CACHE = `wardrobe-shell-${VERSION}`;
const STATIC_CACHE = `wardrobe-static-${VERSION}`;
const MODEL_CACHE = "wardrobe-bg-model"; // не версионируем — модель большая
const SHELL_URLS = [
  "/wardrobe",
  "/wardrobe/add",
  "/wardrobe/item",
  "/outfits",
  "/outfits/editor",
  "/settings",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("wardrobe-") && ![SHELL_CACHE, STATIC_CACHE, MODEL_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isModelRequest(url) {
  return url.hostname === "staticimgly.com" || url.pathname.includes("background-removal");
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) {
      // Кешируем без query (?id=…): страница одна, данные берутся из IndexedDB
      const url = new URL(request.url);
      cache.put(url.origin + url.pathname, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const fallback = await cache.match("/wardrobe");
    if (fallback) return fallback;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (isModelRequest(url)) event.respondWith(cacheFirst(request, MODEL_CACHE));
    return;
  }
  // RSC-запросы клиентской навигации Next не кешируем: при офлайне Next сам перейдёт на полную загрузку
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isModelRequest(url)) {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
  }
});
