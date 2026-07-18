/**
 * JPEG Ghost stego via phasm-core (J-UNIWARD + STC), loaded from vendored WASM.
 */

import initPhasmWasm, {
  ghost_capacity_bytes,
  ghost_embed,
  ghost_extract,
} from "../../vendor/phasm/congrats_phasm_wasm.js";

/** Public Ghost passphrase when UI has no password (none / GPG modes). */
export const JPEG_PUBLIC_STEGO_PASSPHRASE = "congrats-steg-jpeg-ghost-v1";

/** @type {Promise<void> | null} */
let g_phasmInitPromise = null;

/** @type {(() => Promise<void>) | null} */
let g_phasmInitOverride = null;

/**
 * Override WASM loader (used by Node/vitest). Browser builds never call this.
 * side-effects: replaces init strategy for subsequent ensurePhasmWasmReady calls
 * @param {(() => Promise<void>) | null} loader
 * @returns {void}
 */
export function setPhasmWasmInitOverride(loader) {
  g_phasmInitOverride = loader;
  g_phasmInitPromise = null;
}

/**
 * Ensure the Ghost WASM module is initialized (once).
 * side-effects: loads and instantiates WASM
 * @returns {Promise<void>}
 */
export async function ensurePhasmWasmReady() {
  if (g_phasmInitPromise === null) {
    g_phasmInitPromise = g_phasmInitOverride !== null
      ? g_phasmInitOverride()
      : initPhasmWasm();
  }
  await g_phasmInitPromise;
}

/**
 * @param {Uint8Array} jpegBytes
 * @returns {boolean}
 */
export function isJpegByteArray(jpegBytes) {
  return (
    jpegBytes instanceof Uint8Array
    && jpegBytes.length >= 4
    && jpegBytes[0] === 0xff
    && jpegBytes[1] === 0xd8
    && jpegBytes[2] === 0xff
  );
}

/**
 * Estimate Ghost (J-UNIWARD) UTF-8 message capacity for a cover JPEG.
 * @param {Uint8Array} jpegBytes
 * @returns {Promise<number>}
 */
export async function estimateJpegGhostCapacityBytes(jpegBytes) {
  assert(isJpegByteArray(jpegBytes), "expected JPEG SOI marker");
  await ensurePhasmWasmReady();
  return ghost_capacity_bytes(jpegBytes);
}

/**
 * Embed a UTF-8 message into JPEG via Ghost.
 * @param {Uint8Array} jpegBytes
 * @param {string} messageUtf8
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>}
 */
export async function embedUtf8IntoJpegGhost(jpegBytes, messageUtf8, passphrase) {
  assert(isJpegByteArray(jpegBytes), "expected JPEG SOI marker");
  assert(typeof messageUtf8 === "string", `expected string message, got ${typeof messageUtf8}`);
  assert(
    typeof passphrase === "string" && passphrase.length > 0,
    "expected non-empty passphrase",
  );
  await ensurePhasmWasmReady();
  return ghost_embed(jpegBytes, messageUtf8, passphrase);
}

/**
 * Extract UTF-8 message from Ghost stego JPEG.
 * @param {Uint8Array} jpegBytes
 * @param {string} passphrase
 * @returns {Promise<string>}
 */
export async function extractUtf8FromJpegGhost(jpegBytes, passphrase) {
  assert(isJpegByteArray(jpegBytes), "expected JPEG SOI marker");
  assert(
    typeof passphrase === "string" && passphrase.length > 0,
    "expected non-empty passphrase",
  );
  await ensurePhasmWasmReady();
  return ghost_extract(jpegBytes, passphrase);
}

/**
 * Encode arbitrary bytes as base64 for the Ghost UTF-8 channel.
 * @param {Uint8Array} payloadBytes
 * @returns {string}
 */
export function bytesToGhostMessage(payloadBytes) {
  assert(payloadBytes instanceof Uint8Array, "expected Uint8Array payload");
  let binary = "";
  for (let index = 0; index < payloadBytes.length; index += 1) {
    binary += String.fromCharCode(payloadBytes[index]);
  }
  return `CSTB1:${btoa(binary)}`;
}

/**
 * Decode Ghost message produced by {@link bytesToGhostMessage}.
 * @param {string} messageUtf8
 * @returns {Uint8Array}
 */
export function ghostMessageToBytes(messageUtf8) {
  assert(typeof messageUtf8 === "string", `expected string, got ${typeof messageUtf8}`);
  const prefix = "CSTB1:";
  if (!messageUtf8.startsWith(prefix)) {
    throw new Error(
      `expected Ghost message prefix ${JSON.stringify(prefix)}, got ${JSON.stringify(messageUtf8.slice(0, 16))}`,
    );
  }
  const binary = atob(messageUtf8.slice(prefix.length));
  const payloadBytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    payloadBytes[index] = binary.charCodeAt(index);
  }
  return payloadBytes;
}

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
