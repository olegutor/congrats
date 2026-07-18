/** Payload framing, crypto, Feistel diffusion, and PNG spatial stego. */

import { bitsToBytes, bytesToBits } from "../crypto/binary-payload.js";
import {
  feistelMixBits,
  FEISTEL_ROUND_COUNT,
} from "../crypto/bit-diffusion/feistel.js";
import {
  AmbiguousPasswordDecryptError,
  decryptWithPassword,
  defaultPasswordCryptoVersionId,
  encryptWithPassword,
} from "../crypto/password-crypto.js";
import {
  binaryOpenPgpToArmoredMessage,
  gpgPublicKeyEncrypt,
} from "../crypto/gpg-crypto.js";
import {
  embedBitsIntoImageData,
  estimateMaxMessageBits,
  extractBitsFromImageData,
} from "../stego/spatial-embed.js";

export { AmbiguousPasswordDecryptError, estimateMaxMessageBits };

/** Magic ASCII "CST1". */
const FRAME_MAGIC = new Uint8Array([0x43, 0x53, 0x54, 0x31]);

/** Framed payload version byte. */
const FRAME_VERSION = 0x01;

/**
 * @typedef {object} PayloadEncryptOptions
 * @property {string | null} [password]
 * @property {string | null} [passwordCryptoVersionId]
 * @property {string | null} [publicKeyArmored]
 */

/**
 * @typedef {object} PayloadDecryptOptions
 * @property {string | null} [password]
 */

/**
 * @typedef {object} EncodeIntoImageResult
 * @property {SpatialEmbedStatsLike} stegoStats
 * @property {number} framedByteCount
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
 * Encrypt (optional) → frame → Feistel → embed into ImageData.
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
  const embeddedBytes = await prepareEmbeddedBytes(payloadBytes, cryptoOptions);
  const framedBytes = framePayloadBytes(embeddedBytes);
  const maxBits = estimateMaxMessageBits(imageData.width, imageData.height);
  const framedBits = bytesToBits(framedBytes);
  if (framedBits.length > maxBits) {
    throw new Error(
      `payload too large after framing/crypto: ${framedBits.length} bits > capacity ~${maxBits} bits `
        + `(${imageData.width}×${imageData.height} PNG)`,
    );
  }
  const diffusedBits = bitStringToBitArray(feistelMixBits(framedBits, false, FEISTEL_ROUND_COUNT));
  const stegoStats = embedBitsIntoImageData(imageData, diffusedBits);
  return {
    stegoStats,
    framedByteCount: framedBytes.length,
    embeddedByteCount: embeddedBytes.length,
  };
}

/**
 * Extract → inverse Feistel → unframe → optional password decrypt.
 *
 * @param {ImageData} imageData
 * @param {PayloadDecryptOptions} [cryptoOptions]
 * @returns {Promise<{ payloadBytes: Uint8Array, embeddedBytes: Uint8Array }>}
 */
export async function decodeBytesFromImageData(imageData, cryptoOptions = {}) {
  const diffusedBits = extractBitsFromImageData(imageData);
  const diffusedBitString = bitArrayToBitString(diffusedBits);
  const framedBitString = feistelMixBits(diffusedBitString, true, FEISTEL_ROUND_COUNT);
  const framedBytes = bitsToBytes(framedBitString);
  const embeddedBytes = unframePayloadBytes(framedBytes);
  const payloadBytes = await restorePayloadBytes(embeddedBytes, cryptoOptions);
  return { payloadBytes, embeddedBytes };
}

/**
 * Extract embedded bytes and wrap as armored PGP MESSAGE (no private-key decrypt).
 *
 * @param {ImageData} imageData
 * @returns {Promise<{ embeddedBytes: Uint8Array, armoredPgpMessage: string }>}
 */
export async function decodeImageDataToArmoredPgpMessage(imageData) {
  const { embeddedBytes } = await decodeBytesFromImageData(imageData, {});
  const armoredPgpMessage = await binaryOpenPgpToArmoredMessage(embeddedBytes);
  return { embeddedBytes, armoredPgpMessage };
}

/**
 * @param {Uint8Array} payloadBytes
 * @param {PayloadEncryptOptions} [cryptoOptions]
 * @returns {Promise<Uint8Array>}
 */
export async function prepareEmbeddedBytes(payloadBytes, cryptoOptions = {}) {
  const { password, passwordCryptoVersionId, publicKeyArmored } = normalizeEncryptOptions(
    cryptoOptions,
  );
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
  const { password } = normalizeDecryptOptions(cryptoOptions);
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
 * Frame: magic(4) || version(1) || length(4 BE) || payload.
 *
 * @param {Uint8Array} payloadBytes
 * @returns {Uint8Array}
 */
export function framePayloadBytes(payloadBytes) {
  if (payloadBytes.length >= 0xffffffff) {
    throw new Error(`payload too large to frame: ${payloadBytes.length}`);
  }
  const framed = new Uint8Array(4 + 1 + 4 + payloadBytes.length);
  framed.set(FRAME_MAGIC, 0);
  framed[4] = FRAME_VERSION;
  const lengthOffset = 5;
  framed[lengthOffset] = (payloadBytes.length >>> 24) & 0xff;
  framed[lengthOffset + 1] = (payloadBytes.length >>> 16) & 0xff;
  framed[lengthOffset + 2] = (payloadBytes.length >>> 8) & 0xff;
  framed[lengthOffset + 3] = payloadBytes.length & 0xff;
  framed.set(payloadBytes, 9);
  return framed;
}

/**
 * @param {Uint8Array} framedBytes
 * @returns {Uint8Array}
 */
export function unframePayloadBytes(framedBytes) {
  if (framedBytes.length < 9) {
    throw new Error(`framed payload too short: ${framedBytes.length} < 9`);
  }
  for (let index = 0; index < 4; index += 1) {
    if (framedBytes[index] !== FRAME_MAGIC[index]) {
      throw new Error(
        `frame magic mismatch at ${index}: expected ${FRAME_MAGIC[index]}, got ${framedBytes[index]}`,
      );
    }
  }
  if (framedBytes[4] !== FRAME_VERSION) {
    throw new Error(`unsupported frame version ${framedBytes[4]}, expected ${FRAME_VERSION}`);
  }
  const payloadLength = (
    (framedBytes[5] << 24)
    | (framedBytes[6] << 16)
    | (framedBytes[7] << 8)
    | framedBytes[8]
  ) >>> 0;
  if (framedBytes.length < 9 + payloadLength) {
    throw new Error(
      `framed payload truncated: declared ${payloadLength}, have ${framedBytes.length - 9}`,
    );
  }
  return framedBytes.slice(9, 9 + payloadLength);
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
  if (password !== null && publicKeyArmored !== null) {
    throw new Error("expected either password or public key encryption, not both");
  }
  if (passwordCryptoVersionId !== null && password === null) {
    throw new Error("passwordCryptoVersionId requires a password");
  }
  return { password, passwordCryptoVersionId, publicKeyArmored };
}

/**
 * @param {PayloadDecryptOptions} [cryptoOptions]
 * @returns {PayloadDecryptOptions}
 */
function normalizeDecryptOptions(cryptoOptions = {}) {
  assertCryptoOptionsObject(cryptoOptions, "decrypt");
  return { password: cryptoOptions.password ?? null };
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
