/**
 * Verify GPG-signed PWA release manifests (shared by service worker and tests).
 */

import * as openpgp from "openpgp";

/** Fingerprint of olegutor-sign.pub (signing key for release.json). */
export const RELEASE_SIGNING_KEY_FINGERPRINT =
  "A21AB264F4280FE23F5BD510DA59BFD9DCDAD288";

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
 * @param {BufferSource} bytes
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byteValue) =>
    byteValue.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * @typedef {{ path: string, sha256: string }} ReleaseFileEntry
 * @typedef {{
 *   name: string,
 *   version: string,
 *   basePath: string,
 *   createdAt: string,
 *   signingKeyFingerprint: string,
 *   files: ReleaseFileEntry[],
 * }} ReleaseManifest
 */

/**
 * Parse and structurally validate a release manifest object.
 * @param {unknown} parsed
 * @returns {ReleaseManifest}
 */
export function parseReleaseManifest(parsed) {
  assert(parsed !== null && typeof parsed === "object", "release manifest must be an object");
  const manifest = /** @type {Record<string, unknown>} */ (parsed);
  assert(typeof manifest.name === "string" && manifest.name.length > 0, "release.name invalid");
  assert(
    typeof manifest.version === "string" && manifest.version.length > 0,
    "release.version invalid",
  );
  assert(
    typeof manifest.basePath === "string" && manifest.basePath.startsWith("/"),
    `release.basePath must start with /, got ${String(manifest.basePath)}`,
  );
  assert(
    typeof manifest.createdAt === "string" && manifest.createdAt.length > 0,
    "release.createdAt invalid",
  );
  assert(
    typeof manifest.signingKeyFingerprint === "string",
    "release.signingKeyFingerprint invalid",
  );
  assert(
    manifest.signingKeyFingerprint.toUpperCase() === RELEASE_SIGNING_KEY_FINGERPRINT,
    `expected signing fingerprint ${RELEASE_SIGNING_KEY_FINGERPRINT}, got ${manifest.signingKeyFingerprint}`,
  );
  assert(Array.isArray(manifest.files), "release.files must be an array");
  assert(manifest.files.length > 0, "release.files must be non-empty");
  /** @type {ReleaseFileEntry[]} */
  const files = [];
  for (const entry of manifest.files) {
    assert(entry !== null && typeof entry === "object", "release file entry must be an object");
    const fileEntry = /** @type {Record<string, unknown>} */ (entry);
    assert(
      typeof fileEntry.path === "string"
      && fileEntry.path.length > 0
      && !fileEntry.path.startsWith("/")
      && !fileEntry.path.includes(".."),
      `invalid release file path: ${String(fileEntry.path)}`,
    );
    assert(
      typeof fileEntry.sha256 === "string" && /^[0-9a-f]{64}$/.test(fileEntry.sha256),
      `invalid sha256 for ${String(fileEntry.path)}: ${String(fileEntry.sha256)}`,
    );
    files.push({ path: fileEntry.path, sha256: fileEntry.sha256 });
  }
  return {
    name: manifest.name,
    version: manifest.version,
    basePath: manifest.basePath,
    createdAt: manifest.createdAt,
    signingKeyFingerprint: manifest.signingKeyFingerprint.toUpperCase(),
    files,
  };
}

/**
 * Verify a detached GPG signature over exact UTF-8 text.
 * @param {string} signedText
 * @param {string} armoredSignature
 * @param {string} armoredPublicKey
 * @returns {Promise<string>} uppercase fingerprint of the verification key
 */
export async function verifyDetachedSignature(
  signedText,
  armoredSignature,
  armoredPublicKey,
) {
  assert(signedText.length > 0, "signed text is empty");
  assert(armoredSignature.includes("BEGIN PGP SIGNATURE"), "missing PGP signature armor");
  assert(armoredPublicKey.includes("BEGIN PGP PUBLIC KEY BLOCK"), "missing public key armor");

  const verificationKey = await openpgp.readKey({ armoredKey: armoredPublicKey });
  const fingerprint = verificationKey.getFingerprint().toUpperCase();
  const message = await openpgp.createMessage({ text: signedText });
  const signature = await openpgp.readSignature({ armoredSignature });
  const verificationResult = await openpgp.verify({
    message,
    signature,
    verificationKeys: verificationKey,
  });
  assert(
    verificationResult.signatures.length >= 1,
    "expected at least one signature verification result",
  );
  await verificationResult.signatures[0].verified;
  return fingerprint;
}

/**
 * Verify detached GPG signature over exact release.json text and parse it.
 * @param {string} releaseJsonText exact file bytes as UTF-8 text
 * @param {string} armoredSignature detached ASCII-armor signature
 * @param {string} armoredPublicKey olegutor-sign public key block
 * @returns {Promise<ReleaseManifest>}
 */
export async function verifySignedReleaseJson(
  releaseJsonText,
  armoredSignature,
  armoredPublicKey,
) {
  const fingerprint = await verifyDetachedSignature(
    releaseJsonText,
    armoredSignature,
    armoredPublicKey,
  );
  assert(
    fingerprint === RELEASE_SIGNING_KEY_FINGERPRINT,
    `expected key ${RELEASE_SIGNING_KEY_FINGERPRINT}, got ${fingerprint}`,
  );

  let parsedJson;
  try {
    parsedJson = JSON.parse(releaseJsonText);
  } catch (error) {
    throw new Error(`release JSON parse failed: ${String(error)}`);
  }
  return parseReleaseManifest(parsedJson);
}

/**
 * @param {string} basePath e.g. /congrats/
 * @param {string} relativePath e.g. assets/app.js
 * @returns {string}
 */
export function releaseFileUrl(basePath, relativePath) {
  assert(basePath.endsWith("/"), `basePath must end with /, got ${basePath}`);
  assert(!relativePath.startsWith("/"), `relativePath must be relative, got ${relativePath}`);
  return `${basePath}${relativePath}`;
}
