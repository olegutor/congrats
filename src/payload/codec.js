/** Payload crypto, keyed PNG spatial stego, and keyed JPEG Ghost (J-UNIWARD). */

import { bitsToBytes, bytesToBits } from "../crypto/binary-payload.js";
import {
  AmbiguousPasswordDecryptError,
  decryptWithPassword,
  defaultPasswordCryptoVersionId,
  encryptWithPassword,
} from "../crypto/password-crypto.js";
import {
  binaryOpenPgpToArmoredMessage,
  gpgPublicKeyEncrypt,
  readPublicKeyMetadata,
} from "../crypto/gpg-crypto.js";
import {
  GPG_CONTAINER_PROFILES,
  encryptGpgContainer,
  rebuildGpgContainerMessage,
} from "../crypto/gpg-container.js";
import {
  embedBitsIntoImageData,
  embedFixedBitsIntoImageData,
  estimateMaxMessageBits,
  extractBitsFromImageData,
  extractFixedBitsFromImageData,
} from "../stego/spatial-embed.js";
import {
  bytesToGhostMessage,
  embedUtf8IntoJpegGhost,
  estimateJpegGhostCapacityBytes,
  extractUtf8FromJpegGhost,
  ghostMessageToBytes,
  isJpegByteArray,
} from "../stego/jpeg-phasm.js";

export {
  AmbiguousPasswordDecryptError,
  estimateMaxMessageBits,
  estimateJpegGhostCapacityBytes,
  isJpegByteArray,
};

/**
 * @typedef {object} PayloadEncryptOptions
 * @property {string} [stegoPassphrase]
 * @property {string | null} [password]
 * @property {string | null} [passwordCryptoVersionId]
 * @property {string | null} [publicKeyArmored]
 */

/**
 * @typedef {object} PayloadDecryptOptions
 * @property {string} stegoPassphrase
 * @property {string | null} [password]
 */

/**
 * @typedef {object} EncodeIntoImageResult
 * @property {SpatialEmbedStatsLike} stegoStats
 * @property {number} embeddedByteCount
 */

/**
 * @typedef {object} SpatialEmbedStatsLike
 * @property {number} messageBitCount
 * @property {number} coverBitCount
 * @property {number} changedCount
 * @property {number} totalDistortion
 * @property {number} embeddingRate
 */

/**
 * Encrypt (optional) → embed through a passphrase-keyed spatial channel.
 *
 * side-effects: mutates imageData.data
 *
 * @param {ImageData} imageData
 * @param {Uint8Array} payloadBytes
 * @param {PayloadEncryptOptions} [cryptoOptions]
 * @returns {Promise<EncodeIntoImageResult>}
 */
export async function encodeBytesIntoImageData(imageData, payloadBytes, cryptoOptions = {}) {
  if (!(payloadBytes instanceof Uint8Array)) {
    throw new Error(
      `expected Uint8Array payload, got ${Object.prototype.toString.call(payloadBytes)}`,
    );
  }
  const normalized = normalizeEncryptOptions(cryptoOptions);
  if (normalized.publicKeyArmored !== null) {
    const profile = selectGpgProfileForImage(imageData.width, imageData.height);
    const { embeddedBytes } = await encryptGpgContainer(
      payloadBytes,
      normalized.publicKeyArmored,
      profile.embeddedLength,
    );
    const keyMetadata = await readPublicKeyMetadata(normalized.publicKeyArmored);
    const stegoStats = embedFixedBitsIntoImageData(
      imageData,
      bitStringToBitArray(bytesToBits(embeddedBytes)),
      buildPublicKeyChannelKey(keyMetadata.fingerprint),
    );
    return { stegoStats, embeddedByteCount: embeddedBytes.length };
  }
  assertStegoPassphrase(normalized.stegoPassphrase);
  const embeddedBytes = await prepareEmbeddedBytes(payloadBytes, normalized);
  const maxBits = estimateMaxMessageBits(imageData.width, imageData.height);
  const embeddedBits = bytesToBits(embeddedBytes);
  if (embeddedBits.length > maxBits) {
    throw new Error(
      `payload too large after crypto: ${embeddedBits.length} bits > capacity ~${maxBits} bits `
        + `(${imageData.width}×${imageData.height} PNG)`,
    );
  }
  const stegoStats = embedBitsIntoImageData(
    imageData,
    bitStringToBitArray(embeddedBits),
    normalized.stegoPassphrase,
  );
  return {
    stegoStats,
    embeddedByteCount: embeddedBytes.length,
  };
}

/**
 * Select the single fixed GPG profile implied by PNG dimensions.
 *
 * @param {number} width
 * @param {number} height
 * @returns {import("../crypto/gpg-container.js").GpgContainerProfile}
 */
export function selectGpgProfileForImage(width, height) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError(`expected positive integer image size, got ${width}x${height}`);
  }
  const capacityBytes = Math.floor(estimateMaxMessageBits(width, height) / 8);
  let profile;
  for (
    let profileIndex = GPG_CONTAINER_PROFILES.length - 1;
    profileIndex >= 0;
    profileIndex -= 1
  ) {
    // Loop invariant: every larger profile was proven too large for this cover.
    if (GPG_CONTAINER_PROFILES[profileIndex].embeddedLength <= capacityBytes) {
      profile = GPG_CONTAINER_PROFILES[profileIndex];
      break;
    }
  }
  if (profile === undefined) {
    throw new RangeError(
      `expected PNG capacity for at least ${GPG_CONTAINER_PROFILES[0].embeddedLength} GPG bytes, `
        + `got ${capacityBytes} bytes at ${width}x${height}`,
    );
  }
  return profile;
}

/**
 * Extract through the keyed channel → optional password decrypt.
 *
 * @param {ImageData} imageData
 * @param {PayloadDecryptOptions} [cryptoOptions]
 * @returns {Promise<{ payloadBytes: Uint8Array, embeddedBytes: Uint8Array }>}
 */
export async function decodeBytesFromImageData(imageData, cryptoOptions = {}) {
  const normalized = normalizeDecryptOptions(cryptoOptions);
  const embeddedBits = extractBitsFromImageData(imageData, normalized.stegoPassphrase);
  const embeddedBytes = bitsToBytes(bitArrayToBitString(embeddedBits));
  const payloadBytes = await restorePayloadBytes(embeddedBytes, normalized);
  return { payloadBytes, embeddedBytes };
}

/**
 * Extract embedded bytes and wrap as armored PGP MESSAGE (no private-key decrypt).
 *
 * @param {ImageData} imageData
 * @param {PayloadDecryptOptions} cryptoOptions
 * @returns {Promise<{ embeddedBytes: Uint8Array, armoredPgpMessage: string }>}
 */
export async function decodeImageDataToArmoredPgpMessage(imageData, cryptoOptions) {
  const { embeddedBytes } = await decodeBytesFromImageData(imageData, cryptoOptions);
  const armoredPgpMessage = await binaryOpenPgpToArmoredMessage(embeddedBytes);
  return { embeddedBytes, armoredPgpMessage };
}

/**
 * Extract a fixed markerless GPG container and rebuild a standard binary message.
 *
 * @param {ImageData} imageData
 * @param {string} publicKeyArmored
 * @returns {Promise<{
 *   embeddedBytes: Uint8Array,
 *   binaryPgpMessage: Uint8Array,
 *   profile: import("../crypto/gpg-container.js").GpgContainerProfile
 * }>}
 */
export async function decodeImageDataToBinaryGpgMessage(imageData, publicKeyArmored) {
  if (typeof publicKeyArmored !== "string" || !publicKeyArmored.trim()) {
    throw new Error("expected non-empty public key, got empty string");
  }
  const profile = selectGpgProfileForImage(imageData.width, imageData.height);
  const keyMetadata = await readPublicKeyMetadata(publicKeyArmored);
  const embeddedBits = extractFixedBitsFromImageData(
    imageData,
    buildPublicKeyChannelKey(keyMetadata.fingerprint),
    profile.embeddedLength * 8,
  );
  const embeddedBytes = bitsToBytes(bitArrayToBitString(embeddedBits));
  const binaryPgpMessage = await rebuildGpgContainerMessage(
    embeddedBytes,
    publicKeyArmored,
    profile.embeddedLength,
  );
  return { embeddedBytes, binaryPgpMessage, profile };
}

/**
 * Encrypt (optional) → keyed Ghost (J-UNIWARD) embed into JPEG.
 * Password confidentiality uses Ghost AES (no double gcmwrap).
 *
 * @param {Uint8Array} jpegBytes visual JPEG (no stego yet)
 * @param {Uint8Array} payloadBytes
 * @param {PayloadEncryptOptions} [cryptoOptions]
 * @returns {Promise<{ jpegBytes: Uint8Array, embeddedByteCount: number, capacityBytes: number }>}
 */
export async function encodeBytesIntoJpegBytes(jpegBytes, payloadBytes, cryptoOptions = {}) {
  if (!(payloadBytes instanceof Uint8Array)) {
    throw new Error(
      `expected Uint8Array payload, got ${Object.prototype.toString.call(payloadBytes)}`,
    );
  }
  if (!isJpegByteArray(jpegBytes)) {
    throw new Error("expected JPEG SOI marker for Ghost embed");
  }
  if (cryptoOptions.publicKeyArmored != null) {
    throw new Error("public-key mode without a stego passphrase supports PNG only");
  }
  const normalized = normalizeEncryptOptions(cryptoOptions);
  const ghostPassphrase = normalized.stegoPassphrase;
  /** @type {Uint8Array} */
  let embeddedBytes;
  if (normalized.password !== null) {
    // Ghost AES-GCM-SIV provides confidentiality; skip gcmwrap.
    embeddedBytes = payloadBytes;
  } else {
    embeddedBytes = await prepareEmbeddedBytes(payloadBytes, {
      publicKeyArmored: normalized.publicKeyArmored,
    });
  }
  const ghostMessage = bytesToGhostMessage(embeddedBytes);
  const capacityBytes = await estimateJpegGhostCapacityBytes(jpegBytes);
  if (ghostMessage.length > capacityBytes) {
    throw new Error(
      `JPEG Ghost payload too large: message ${ghostMessage.length} chars > capacity ~${capacityBytes}`,
    );
  }
  const stegoJpegBytes = await embedUtf8IntoJpegGhost(
    jpegBytes,
    ghostMessage,
    ghostPassphrase,
  );
  return {
    jpegBytes: stegoJpegBytes,
    embeddedByteCount: embeddedBytes.length,
    capacityBytes,
  };
}

/**
 * Extract keyed Ghost JPEG → optional password path (already decrypted by Ghost).
 *
 * @param {Uint8Array} jpegBytes
 * @param {PayloadDecryptOptions} [cryptoOptions]
 * @returns {Promise<{ payloadBytes: Uint8Array, embeddedBytes: Uint8Array }>}
 */
export async function decodeBytesFromJpegBytes(jpegBytes, cryptoOptions = {}) {
  if (!isJpegByteArray(jpegBytes)) {
    throw new Error("expected JPEG SOI marker for Ghost extract");
  }
  const normalized = normalizeDecryptOptions(cryptoOptions);
  const ghostMessage = await extractUtf8FromJpegGhost(jpegBytes, normalized.stegoPassphrase);
  const embeddedBytes = ghostMessageToBytes(ghostMessage);
  /** @type {Uint8Array} */
  let payloadBytes;
  if (normalized.password !== null) {
    payloadBytes = embeddedBytes;
  } else {
    payloadBytes = await restorePayloadBytes(embeddedBytes, normalized);
  }
  return {
    payloadBytes,
    embeddedBytes,
  };
}

/**
 * @param {Uint8Array} jpegBytes
 * @param {PayloadDecryptOptions} cryptoOptions
 * @returns {Promise<{ embeddedBytes: Uint8Array, armoredPgpMessage: string }>}
 */
export async function decodeJpegBytesToArmoredPgpMessage(jpegBytes, cryptoOptions) {
  const { embeddedBytes } = await decodeBytesFromJpegBytes(jpegBytes, cryptoOptions);
  const armoredPgpMessage = await binaryOpenPgpToArmoredMessage(embeddedBytes);
  return { embeddedBytes, armoredPgpMessage };
}

/**
 * @param {Uint8Array} payloadBytes
 * @param {PayloadEncryptOptions} [cryptoOptions]
 * @returns {Promise<Uint8Array>}
 */
export async function prepareEmbeddedBytes(payloadBytes, cryptoOptions = {}) {
  assertCryptoOptionsObject(cryptoOptions, "payload encrypt");
  const password = cryptoOptions.password ?? null;
  const passwordCryptoVersionId = cryptoOptions.passwordCryptoVersionId ?? null;
  const publicKeyArmored = cryptoOptions.publicKeyArmored ?? null;
  assertPayloadEncryptionSelection(password, passwordCryptoVersionId, publicKeyArmored);
  if (password !== null) {
    if (!password) {
      throw new Error("expected non-empty password, got empty string");
    }
    const versionId = passwordCryptoVersionId ?? defaultPasswordCryptoVersionId();
    return encryptWithPassword(payloadBytes, password, versionId);
  }
  if (publicKeyArmored !== null) {
    if (!publicKeyArmored.trim()) {
      throw new Error("expected non-empty public key, got empty string");
    }
    return gpgPublicKeyEncrypt(payloadBytes, publicKeyArmored);
  }
  return payloadBytes;
}

/**
 * @param {Uint8Array} embeddedBytes
 * @param {PayloadDecryptOptions} [cryptoOptions]
 * @returns {Promise<Uint8Array>}
 */
export async function restorePayloadBytes(embeddedBytes, cryptoOptions = {}) {
  assertCryptoOptionsObject(cryptoOptions, "payload decrypt");
  const password = cryptoOptions.password ?? null;
  if (password !== null) {
    if (!password) {
      throw new Error("expected non-empty password, got empty string");
    }
    const { payloadBytes } = await decryptWithPassword(embeddedBytes, password);
    return payloadBytes;
  }
  return embeddedBytes;
}

/**
 * @param {PayloadEncryptOptions} [cryptoOptions]
 * @returns {PayloadEncryptOptions}
 */
function normalizeEncryptOptions(cryptoOptions = {}) {
  assertCryptoOptionsObject(cryptoOptions, "encrypt");
  const password = cryptoOptions.password ?? null;
  const passwordCryptoVersionId = cryptoOptions.passwordCryptoVersionId ?? null;
  const publicKeyArmored = cryptoOptions.publicKeyArmored ?? null;
  const stegoPassphrase = cryptoOptions.stegoPassphrase ?? null;
  assertPayloadEncryptionSelection(password, passwordCryptoVersionId, publicKeyArmored);
  if (publicKeyArmored === null) {
    assertStegoPassphrase(stegoPassphrase);
  } else if (!publicKeyArmored.trim()) {
    throw new Error("expected non-empty public key, got empty string");
  }
  return { stegoPassphrase, password, passwordCryptoVersionId, publicKeyArmored };
}

/**
 * @param {PayloadDecryptOptions} [cryptoOptions]
 * @returns {PayloadDecryptOptions}
 */
function normalizeDecryptOptions(cryptoOptions = {}) {
  assertCryptoOptionsObject(cryptoOptions, "decrypt");
  const stegoPassphrase = cryptoOptions.stegoPassphrase;
  assertStegoPassphrase(stegoPassphrase);
  return { stegoPassphrase, password: cryptoOptions.password ?? null };
}

/**
 * @param {unknown} cryptoOptions
 * @param {string} operationName
 * @returns {void}
 */
function assertCryptoOptionsObject(cryptoOptions, operationName) {
  if (cryptoOptions === null || typeof cryptoOptions !== "object" || Array.isArray(cryptoOptions)) {
    throw new Error(
      `expected ${operationName} options object, got ${Object.prototype.toString.call(cryptoOptions)}`,
    );
  }
}

/**
 * @param {unknown} stegoPassphrase
 * @returns {asserts stegoPassphrase is string}
 */
function assertStegoPassphrase(stegoPassphrase) {
  if (typeof stegoPassphrase !== "string" || stegoPassphrase.length === 0) {
    throw new Error("expected non-empty stegoPassphrase");
  }
}

/**
 * @param {string | null} password
 * @param {string | null} passwordCryptoVersionId
 * @param {string | null} publicKeyArmored
 * @returns {void}
 */
function assertPayloadEncryptionSelection(password, passwordCryptoVersionId, publicKeyArmored) {
  if (password !== null && publicKeyArmored !== null) {
    throw new Error("expected either password or public key encryption, not both");
  }
  if (passwordCryptoVersionId !== null && password === null) {
    throw new Error("passwordCryptoVersionId requires a password");
  }
}

/**
 * Domain-separate the public fingerprint used for the fixed spatial layout.
 *
 * @param {string} primaryFingerprint
 * @returns {string}
 */
function buildPublicKeyChannelKey(primaryFingerprint) {
  if (!/^[0-9a-f]{40,64}$/iu.test(primaryFingerprint)) {
    throw new Error(`expected hexadecimal OpenPGP fingerprint, got ${primaryFingerprint}`);
  }
  return `congrats-steg:gpg-fixed-png:${primaryFingerprint.toUpperCase()}`;
}

/**
 * @param {string} bitString
 * @returns {Uint8Array}
 */
function bitStringToBitArray(bitString) {
  const bits = new Uint8Array(bitString.length);
  for (let index = 0; index < bitString.length; index += 1) {
    const character = bitString[index];
    if (character !== "0" && character !== "1") {
      throw new Error(`expected bit character 0/1, got ${JSON.stringify(character)}`);
    }
    bits[index] = character === "1" ? 1 : 0;
  }
  return bits;
}

/**
 * @param {Uint8Array} bits
 * @returns {string}
 */
function bitArrayToBitString(bits) {
  let bitString = "";
  for (let index = 0; index < bits.length; index += 1) {
    bitString += bits[index] === 1 ? "1" : "0";
  }
  return bitString;
}
