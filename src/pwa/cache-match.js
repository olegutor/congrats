/**
 * Robust Cache Storage lookup helpers (shared ideas for SW / page).
 * Kept free of openpgp so the service worker chunk stays small if split later.
 */

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Find a cached response by exact URL, then by pathname / filename across caches.
 * @param {string} requestUrl absolute or path URL
 * @param {string} [cacheNamePrefix] if set, only search these caches
 * @returns {Promise<Response | undefined>}
 */
export async function matchCachedResponse(requestUrl, cacheNamePrefix = "") {
  assert(requestUrl.length > 0, "requestUrl empty");
  const direct = await caches.match(requestUrl, { ignoreSearch: true });
  if (direct !== undefined) {
    return direct;
  }

  let pathname;
  try {
    pathname = new URL(requestUrl, globalThis.location?.origin ?? "http://localhost").pathname;
  } catch {
    return undefined;
  }
  const fileName = pathname.split("/").pop() ?? "";
  assert(fileName.length > 0, `empty file name for ${requestUrl}`);

  const cacheNames = (await caches.keys())
    .filter((cacheName) =>
      cacheNamePrefix.length === 0 ? true : cacheName.startsWith(cacheNamePrefix),
    )
    .sort()
    .reverse();

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    for (const request of await cache.keys()) {
      const cachedPathname = new URL(request.url).pathname;
      if (cachedPathname === pathname || cachedPathname.endsWith(`/${fileName}`)) {
        const hit = await cache.match(request);
        if (hit !== undefined) {
          return hit;
        }
      }
    }
  }
  return undefined;
}
