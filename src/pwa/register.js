/**
 * Register the GPG-gated service worker and poll for signed updates.
 */

import { RELEASE_SIGNING_KEY_FINGERPRINT } from "./release-verify.js";

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
 * @returns {string} site base path ending with /
 */
function readBasePath() {
  const basePath = import.meta.env.BASE_URL;
  assert(typeof basePath === "string" && basePath.length > 0, "BASE_URL missing");
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

/**
 * Register SW (module) and check for GPG-signed releases.
 * side-effects: service worker registration, may reload on signed update
 * @returns {Promise<void>}
 */
export async function registerCongratsServiceWorker() {
  if (!import.meta.env.PROD) {
    return;
  }
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const basePath = readBasePath();
  const scriptUrl = `${basePath}sw.js`;
  const registration = await navigator.serviceWorker.register(scriptUrl, {
    scope: basePath,
    type: "module",
    updateViaCache: "none",
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if (data === null || typeof data !== "object") {
      return;
    }
    const message = /** @type {{ type?: string, status?: string, version?: string, error?: string }} */ (
      data
    );
    if (message.type !== "SIGNED_UPDATE_RESULT") {
      return;
    }
    if (message.status === "updated") {
      console.info(
        `[pwa] applied signed release ${message.version} (key ${RELEASE_SIGNING_KEY_FINGERPRINT})`,
      );
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set("pwaReloaded", message.version ?? "1");
      window.location.replace(reloadUrl.href);
      return;
    }
    if (message.status === "rejected") {
      console.warn(`[pwa] signed update rejected: ${message.error}`);
    }
  });

  await requestSignedUpdateCheck(registration);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void requestSignedUpdateCheck(registration);
    }
  });
}

/**
 * Ask the active (or installing) worker to pull a newly signed release.
 * side-effects: postMessage to service worker
 * @param {ServiceWorkerRegistration} registration
 * @returns {Promise<void>}
 */
async function requestSignedUpdateCheck(registration) {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (worker === null) {
    return;
  }
  worker.postMessage({ type: "CHECK_SIGNED_UPDATE" });
}
