/**
 * Congrats Steg service worker: offline cache + updates only via GPG-signed release.json.
 */

import {
  RELEASE_SIGNING_KEY_FINGERPRINT,
  releaseFileUrl,
  sha256Hex,
  verifySignedReleaseJson,
} from "./release-verify.js";

const g_cacheNamePrefix = "congrats-steg-";
const g_releaseJsonPath = "release.json";
const g_releaseSigPath = "release.json.asc";
const g_publicKeyPath = "olegutor-sign.pub";

/** @type {string} */
const g_basePath = new URL(self.registration.scope).pathname.endsWith("/")
  ? new URL(self.registration.scope).pathname
  : `${new URL(self.registration.scope).pathname}/`;

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
 * @param {string} version
 * @returns {string}
 */
function cacheNameForVersion(version) {
  assert(version.length > 0, "cache version empty");
  return `${g_cacheNamePrefix}${version}`;
}

/**
 * @param {string} relativePath
 * @returns {Promise<Response>}
 */
async function fetchScoped(relativePath) {
  const response = await fetch(releaseFileUrl(g_basePath, relativePath), {
    cache: "no-store",
  });
  assert(response.ok, `fetch failed ${relativePath}: HTTP ${response.status}`);
  return response;
}

/**
 * Fetch release.json + .asc + pubkey, verify GPG signature.
 * @returns {Promise<{
 *   manifest: import("./release-verify.js").ReleaseManifest,
 *   releaseJsonText: string,
 *   armoredSignature: string,
 *   armoredPublicKey: string,
 * }>}
 */
async function fetchVerifiedReleaseFromNetwork() {
  const [releaseResponse, signatureResponse, publicKeyResponse] = await Promise.all([
    fetchScoped(g_releaseJsonPath),
    fetchScoped(g_releaseSigPath),
    fetchScoped(g_publicKeyPath),
  ]);
  const releaseJsonText = await releaseResponse.text();
  const armoredSignature = await signatureResponse.text();
  const armoredPublicKey = await publicKeyResponse.text();
  const manifest = await verifySignedReleaseJson(
    releaseJsonText,
    armoredSignature,
    armoredPublicKey,
  );
  assert(
    manifest.basePath === g_basePath,
    `release basePath ${manifest.basePath} != SW scope ${g_basePath}`,
  );
  assert(
    manifest.signingKeyFingerprint === RELEASE_SIGNING_KEY_FINGERPRINT,
    "release fingerprint mismatch after verify",
  );
  return { manifest, releaseJsonText, armoredSignature, armoredPublicKey };
}

/**
 * Download every file listed in the manifest, check hashes, fill a cache.
 * side-effects: writes Cache Storage
 * @param {import("./release-verify.js").ReleaseManifest} manifest
 * @param {string} releaseJsonText
 * @param {string} armoredSignature
 * @param {string} armoredPublicKey
 * @returns {Promise<void>}
 */
async function populateReleaseCache(
  manifest,
  releaseJsonText,
  armoredSignature,
  armoredPublicKey,
) {
  const cache = await caches.open(cacheNameForVersion(manifest.version));
  for (const fileEntry of manifest.files) {
    const response = await fetchScoped(fileEntry.path);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = await sha256Hex(bytes);
    assert(
      digest === fileEntry.sha256,
      `hash mismatch for ${fileEntry.path}: expected ${fileEntry.sha256}, got ${digest}`,
    );
    await cache.put(
      releaseFileUrl(g_basePath, fileEntry.path),
      new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
  }
  await cache.put(
    releaseFileUrl(g_basePath, g_releaseJsonPath),
    new Response(releaseJsonText, {
      headers: { "Content-Type": "application/json" },
    }),
  );
  await cache.put(
    releaseFileUrl(g_basePath, g_releaseSigPath),
    new Response(armoredSignature, {
      headers: { "Content-Type": "application/pgp-signature" },
    }),
  );
  await cache.put(
    releaseFileUrl(g_basePath, g_publicKeyPath),
    new Response(armoredPublicKey, {
      headers: { "Content-Type": "application/pgp-keys" },
    }),
  );
}

/**
 * side-effects: deletes other congrats-steg caches
 * @param {string} activeVersion
 * @returns {Promise<void>}
 */
async function deleteOtherCaches(activeVersion) {
  const keepName = cacheNameForVersion(activeVersion);
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(
        (cacheName) =>
          cacheName.startsWith(g_cacheNamePrefix) && cacheName !== keepName,
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
}

/**
 * @returns {Promise<string | null>}
 */
async function readCachedReleaseVersion() {
  const cacheNames = (await caches.keys())
    .filter((cacheName) => cacheName.startsWith(g_cacheNamePrefix))
    .sort();
  if (cacheNames.length === 0) {
    return null;
  }
  const newestCacheName = cacheNames[cacheNames.length - 1];
  return newestCacheName.slice(g_cacheNamePrefix.length);
}

/**
 * Verify signed release, populate cache, drop older caches.
 * side-effects: Cache Storage
 * @returns {Promise<import("./release-verify.js").ReleaseManifest>}
 */
async function applySignedReleaseFromNetwork() {
  const {
    manifest,
    releaseJsonText,
    armoredSignature,
    armoredPublicKey,
  } = await fetchVerifiedReleaseFromNetwork();
  await populateReleaseCache(
    manifest,
    releaseJsonText,
    armoredSignature,
    armoredPublicKey,
  );
  await deleteOtherCaches(manifest.version);
  return manifest;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await applySignedReleaseFromNetwork();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }
  if (!requestUrl.pathname.startsWith(g_basePath)) {
    return;
  }
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached !== undefined) {
        return cached;
      }
      if (event.request.mode === "navigate") {
        const indexCached = await caches.match(
          releaseFileUrl(g_basePath, "index.html"),
        );
        if (indexCached !== undefined) {
          return indexCached;
        }
      }
      return fetch(event.request);
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === null || typeof data !== "object") {
    return;
  }
  const messageType = /** @type {{ type?: string }} */ (data).type;
  if (messageType === "CHECK_SIGNED_UPDATE") {
    event.waitUntil(
      (async () => {
        const source = event.source;
        try {
          const previousVersion = await readCachedReleaseVersion();
          const manifest = await applySignedReleaseFromNetwork();
          if (manifest.version === previousVersion) {
            source?.postMessage({
              type: "SIGNED_UPDATE_RESULT",
              status: "unchanged",
              version: manifest.version,
            });
            return;
          }
          source?.postMessage({
            type: "SIGNED_UPDATE_RESULT",
            status: "updated",
            version: manifest.version,
            previousVersion,
          });
        } catch (error) {
          source?.postMessage({
            type: "SIGNED_UPDATE_RESULT",
            status: "rejected",
            error: String(error),
          });
        }
      })(),
    );
  }
});
