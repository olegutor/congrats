/** Fixed-size markerless RSA-3072 OpenPGP containers. */

import * as openpgp from "openpgp";

const RSA_BITS = 3072;
const RSA_CIPHERTEXT_LENGTH_BYTES = RSA_BITS / 8;
const LIFTED_RSA_LENGTH_BYTES = 400;
const LIFTED_RSA_BITS = LIFTED_RSA_LENGTH_BYTES * 8;
const SEIPD_V1_ENCRYPTION_OVERHEAD_BYTES = 40;
const MINIMUM_PADDING_LENGTH_BYTES = 1;
const LITERAL_FILENAME = "payload.bin";
const FIXED_LITERAL_DATE = new Date(0);
const ENCRYPTION_CONFIG = Object.freeze({
  aeadProtect: false,
  preferredCompressionAlgorithm: openpgp.enums.compression.uncompressed,
  preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
});
const EMBEDDED_LENGTHS_BYTES = Object.freeze([1024, 2048, 4096, 8192, 16384, 32768]);

/**
 * @typedef {Readonly<{
 *   embeddedLength: number,
 *   encryptedSeipdLength: number,
 *   maxPayloadLength: number,
 * }>} GpgContainerProfile
 */

/**
 * Concatenate byte arrays.
 *
 * @param {Uint8Array[]} byteArrays shapes [(length_0,), ..., (length_n,)]
 * @returns {Uint8Array} shape (sum(length_i),)
 */
function concatenateBytes(byteArrays) {
  if (!Array.isArray(byteArrays)) {
    throw new TypeError(`expected byteArrays Array, got ${typeof byteArrays}`);
  }
  const totalLength = byteArrays.reduce((lengthSum, bytes) => {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError(`expected Uint8Array element, got ${Object.prototype.toString.call(bytes)}`);
    }
    return lengthSum + bytes.length;
  }, 0);
  const concatenatedBytes = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const bytes of byteArrays) {
    // Loop invariant: [0, writeOffset) contains every preceding array in order.
    concatenatedBytes.set(bytes, writeOffset);
    writeOffset += bytes.length;
  }
  if (writeOffset !== totalLength) {
    throw new Error(`expected writeOffset ${totalLength}, got ${writeOffset}`);
  }
  return concatenatedBytes;
}

/**
 * Convert unsigned big-endian bytes to an integer.
 *
 * @param {Uint8Array} integerBytes shape (integerLength,)
 * @returns {bigint} shape ()
 */
function bytesToBigInt(integerBytes) {
  if (!(integerBytes instanceof Uint8Array)) {
    throw new TypeError(`expected Uint8Array integerBytes, got ${Object.prototype.toString.call(integerBytes)}`);
  }
  let integerValue = 0n;
  for (const integerByte of integerBytes) {
    // Loop invariant: integerValue is the big-endian value of all visited bytes.
    integerValue = (integerValue << 8n) | BigInt(integerByte);
  }
  return integerValue;
}

/**
 * Encode an unsigned integer to a fixed-width big-endian array.
 *
 * @param {bigint} integerValue shape ()
 * @param {number} outputLength shape ()
 * @returns {Uint8Array} shape (outputLength,)
 */
function bigIntToFixedBytes(integerValue, outputLength) {
  if (typeof integerValue !== "bigint" || integerValue < 0n) {
    throw new TypeError(`expected non-negative bigint integerValue, got ${String(integerValue)}`);
  }
  if (!Number.isSafeInteger(outputLength) || outputLength <= 0) {
    throw new TypeError(`expected positive safe outputLength, got ${outputLength}`);
  }
  const outputBytes = new Uint8Array(outputLength);
  let remainingValue = integerValue;
  for (let byteIndex = outputLength - 1; byteIndex >= 0; byteIndex -= 1) {
    // Loop invariant: bytes after byteIndex encode the removed low-order octets.
    outputBytes[byteIndex] = Number(remainingValue & 0xffn);
    remainingValue >>= 8n;
  }
  if (remainingValue !== 0n) {
    throw new RangeError(`expected integer to fit ${outputLength} bytes, got residual ${remainingValue}`);
  }
  return outputBytes;
}

/**
 * Fill an array with cryptographically secure random bytes.
 *
 * side-effects: consumes randomness from the platform CSPRNG.
 *
 * @param {number} byteLength shape ()
 * @returns {Uint8Array} shape (byteLength,)
 */
function createRandomBytes(byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new TypeError(`expected non-negative safe byteLength, got ${byteLength}`);
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("expected platform crypto.getRandomValues, got unavailable");
  }
  const randomBytes = new Uint8Array(byteLength);
  for (let writeOffset = 0; writeOffset < byteLength; writeOffset += 65536) {
    // Loop invariant: bytes before writeOffset were filled by the platform CSPRNG.
    globalThis.crypto.getRandomValues(
      randomBytes.subarray(writeOffset, Math.min(writeOffset + 65536, byteLength)),
    );
  }
  return randomBytes;
}

/**
 * Sample uniformly from the inclusive integer interval [0, maximumValue].
 *
 * side-effects: consumes randomness from the platform CSPRNG.
 *
 * @param {bigint} maximumValue shape ()
 * @returns {bigint} shape ()
 */
function sampleUniformBigInt(maximumValue) {
  if (typeof maximumValue !== "bigint" || maximumValue < 0n) {
    throw new TypeError(`expected non-negative bigint maximumValue, got ${String(maximumValue)}`);
  }
  const sampleRange = maximumValue + 1n;
  const significantBits = sampleRange === 1n ? 1 : (sampleRange - 1n).toString(2).length;
  const sampleLength = Math.ceil(significantBits / 8);
  const highByteMask = 0xff >>> ((sampleLength * 8) - significantBits);
  for (;;) {
    const sampleBytes = createRandomBytes(sampleLength);
    sampleBytes[0] &= highByteMask;
    const sampledValue = bytesToBigInt(sampleBytes);
    if (sampledValue < sampleRange) {
      return sampledValue;
    }
  }
}

/**
 * Construct the required Literal Data plus Padding packet message.
 *
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {Uint8Array} paddingBytes shape (paddingLength,)
 * @returns {openpgp.Message<Uint8Array>} shape ()
 */
function createPlaintextMessage(payloadBytes, paddingBytes) {
  if (!(payloadBytes instanceof Uint8Array)) {
    throw new TypeError(`expected Uint8Array payloadBytes, got ${Object.prototype.toString.call(payloadBytes)}`);
  }
  if (!(paddingBytes instanceof Uint8Array) || paddingBytes.length < MINIMUM_PADDING_LENGTH_BYTES) {
    throw new TypeError(`expected non-empty Uint8Array paddingBytes, got length ${paddingBytes?.length}`);
  }
  const literalPacket = new openpgp.LiteralDataPacket(FIXED_LITERAL_DATE);
  literalPacket.setBytes(payloadBytes, openpgp.enums.literal.binary);
  literalPacket.setFilename(LITERAL_FILENAME);
  const paddingPacket = new openpgp.PaddingPacket();
  paddingPacket.padding = paddingBytes;
  return new openpgp.Message(new openpgp.PacketList(literalPacket, paddingPacket));
}

/**
 * Find padding that makes the raw SEIPDv1 encrypted field exactly sized.
 *
 * @param {number} payloadLength shape ()
 * @param {number} encryptedSeipdLength shape ()
 * @returns {number} shape (); -1 means this canonical packet encoding cannot fit
 */
function findPaddingLength(payloadLength, encryptedSeipdLength) {
  if (!Number.isSafeInteger(payloadLength) || payloadLength < 0) {
    throw new TypeError(`expected non-negative safe payloadLength, got ${payloadLength}`);
  }
  if (!Number.isSafeInteger(encryptedSeipdLength)
      || encryptedSeipdLength <= SEIPD_V1_ENCRYPTION_OVERHEAD_BYTES) {
    throw new TypeError(`expected usable encryptedSeipdLength, got ${encryptedSeipdLength}`);
  }
  const targetPlaintextPacketLength = encryptedSeipdLength - SEIPD_V1_ENCRYPTION_OVERHEAD_BYTES;
  let paddingLength = MINIMUM_PADDING_LENGTH_BYTES;
  for (let sizingAttempt = 0; sizingAttempt < 4; sizingAttempt += 1) {
    // Loop invariant: paddingLength is positive and the next correction targets the exact length.
    const plaintextMessage = createPlaintextMessage(
      new Uint8Array(payloadLength),
      new Uint8Array(paddingLength),
    );
    const serializedLength = plaintextMessage.write().length;
    const lengthDifference = targetPlaintextPacketLength - serializedLength;
    if (lengthDifference === 0) {
      return paddingLength;
    }
    if (paddingLength + lengthDifference < MINIMUM_PADDING_LENGTH_BYTES) {
      return -1;
    }
    paddingLength += lengthDifference;
  }
  return -1;
}

/**
 * Calculate the largest payload that has an exact canonical encoding.
 *
 * @param {number} encryptedSeipdLength shape ()
 * @returns {number} shape ()
 */
function calculateMaxPayloadLength(encryptedSeipdLength) {
  let payloadLength = encryptedSeipdLength - SEIPD_V1_ENCRYPTION_OVERHEAD_BYTES;
  while (payloadLength >= 0) {
    // Loop invariant: every larger candidate was proven not to fit exactly.
    if (findPaddingLength(payloadLength, encryptedSeipdLength) >= 0) {
      return payloadLength;
    }
    payloadLength -= 1;
  }
  throw new RangeError(`expected positive capacity for encrypted length ${encryptedSeipdLength}, got none`);
}

/**
 * Return and validate the fixed profile identified by embedded byte length.
 *
 * @param {number} embeddedLength shape ()
 * @returns {GpgContainerProfile} shape ()
 */
export function getGpgContainerProfile(embeddedLength) {
  if (!Number.isSafeInteger(embeddedLength)) {
    throw new TypeError(`expected safe integer embeddedLength, got ${embeddedLength}`);
  }
  const profile = GPG_CONTAINER_PROFILES.find(
    (candidateProfile) => candidateProfile.embeddedLength === embeddedLength,
  );
  if (profile === undefined) {
    throw new RangeError(`expected embeddedLength in ${EMBEDDED_LENGTHS_BYTES.join(", ")}, got ${embeddedLength}`);
  }
  return profile;
}

/**
 * Select the smallest profile that can encode this payload exactly.
 *
 * @param {number} payloadLength shape ()
 * @returns {GpgContainerProfile} shape ()
 */
export function selectGpgContainerProfile(payloadLength) {
  if (!Number.isSafeInteger(payloadLength) || payloadLength < 0) {
    throw new TypeError(`expected non-negative safe payloadLength, got ${payloadLength}`);
  }
  const profile = GPG_CONTAINER_PROFILES.find((candidateProfile) => (
    payloadLength <= candidateProfile.maxPayloadLength
    && findPaddingLength(payloadLength, candidateProfile.encryptedSeipdLength) >= 0
  ));
  if (profile === undefined) {
    throw new RangeError(`expected payload fitting a fixed profile, got ${payloadLength} bytes`);
  }
  return profile;
}

/**
 * Parse and validate an armored key with an actual RSA-3072 encryption subkey.
 *
 * @param {string} publicKeyArmored shape ()
 * @returns {Promise<{publicKey: openpgp.PublicKey, encryptionSubkey: openpgp.Subkey, modulus: bigint}>} shape ()
 */
async function readRsa3072EncryptionKey(publicKeyArmored) {
  if (typeof publicKeyArmored !== "string" || publicKeyArmored.length === 0) {
    throw new TypeError(`expected non-empty string publicKeyArmored, got ${typeof publicKeyArmored}`);
  }
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const encryptionSubkey = await publicKey.getEncryptionKey();
  const algorithmInfo = encryptionSubkey.getAlgorithmInfo();
  if (encryptionSubkey.keyPacket.constructor.tag !== openpgp.enums.packet.publicSubkey) {
    throw new TypeError(`expected actual public encryption subkey tag ${openpgp.enums.packet.publicSubkey}, got ${encryptionSubkey.keyPacket.constructor.tag}`);
  }
  if (!algorithmInfo.algorithm.startsWith("rsa") || algorithmInfo.bits !== RSA_BITS) {
    throw new TypeError(`expected RSA-${RSA_BITS} encryption subkey, got ${algorithmInfo.algorithm}-${algorithmInfo.bits}`);
  }
  const modulusBytes = encryptionSubkey.keyPacket.publicParams.n;
  if (!(modulusBytes instanceof Uint8Array) || modulusBytes.length !== RSA_CIPHERTEXT_LENGTH_BYTES) {
    throw new TypeError(`expected ${RSA_CIPHERTEXT_LENGTH_BYTES}-byte RSA modulus, got ${modulusBytes?.length}`);
  }
  const modulus = bytesToBigInt(modulusBytes);
  if (modulus >> BigInt(RSA_BITS - 1) !== 1n) {
    throw new RangeError(`expected exactly ${RSA_BITS}-bit modulus, got ${modulus.toString(2).length} bits`);
  }
  return { publicKey, encryptionSubkey, modulus };
}

/**
 * Lift an RSA ciphertext residue uniformly over its full 3200-bit preimage range.
 *
 * side-effects: consumes randomness from the platform CSPRNG.
 *
 * @param {Uint8Array} rsaCiphertextBytes shape (rsaCiphertextLength,), rsaCiphertextLength <= 384
 * @param {bigint} modulus shape ()
 * @returns {Uint8Array} shape (400,)
 */
function liftRsaCiphertext(rsaCiphertextBytes, modulus) {
  if (!(rsaCiphertextBytes instanceof Uint8Array)
      || rsaCiphertextBytes.length === 0
      || rsaCiphertextBytes.length > RSA_CIPHERTEXT_LENGTH_BYTES) {
    throw new TypeError(`expected 1..${RSA_CIPHERTEXT_LENGTH_BYTES}-byte RSA ciphertext, got ${rsaCiphertextBytes?.length}`);
  }
  if (typeof modulus !== "bigint" || modulus <= 0n) {
    throw new TypeError(`expected positive bigint modulus, got ${String(modulus)}`);
  }
  const rsaCiphertext = bytesToBigInt(rsaCiphertextBytes);
  if (rsaCiphertext >= modulus) {
    throw new RangeError(`expected RSA ciphertext below modulus, got c >= n`);
  }
  const largestLiftedValue = (1n << BigInt(LIFTED_RSA_BITS)) - 1n;
  const maximumQuotient = (largestLiftedValue - rsaCiphertext) / modulus;
  const randomQuotient = sampleUniformBigInt(maximumQuotient);
  return bigIntToFixedBytes(
    rsaCiphertext + (randomQuotient * modulus),
    LIFTED_RSA_LENGTH_BYTES,
  );
}

/**
 * Recover the standard RSA ciphertext MPI value from an embedded container.
 *
 * @param {Uint8Array} embeddedBytes shape (profile.embeddedLength,)
 * @param {string} publicKeyArmored shape ()
 * @param {number} profileEmbeddedLength shape ()
 * @returns {Promise<Uint8Array>} shape (384,)
 */
export async function recoverGpgContainerRsaCiphertext(
  embeddedBytes,
  publicKeyArmored,
  profileEmbeddedLength,
) {
  if (!(embeddedBytes instanceof Uint8Array)) {
    throw new TypeError(`expected Uint8Array embeddedBytes, got ${Object.prototype.toString.call(embeddedBytes)}`);
  }
  const profile = getGpgContainerProfile(profileEmbeddedLength);
  if (embeddedBytes.length !== profile.embeddedLength) {
    throw new RangeError(`expected embedded length ${profile.embeddedLength}, got ${embeddedBytes.length}`);
  }
  const { modulus } = await readRsa3072EncryptionKey(publicKeyArmored);
  const liftedCiphertext = bytesToBigInt(embeddedBytes.subarray(0, LIFTED_RSA_LENGTH_BYTES));
  return bigIntToFixedBytes(liftedCiphertext % modulus, RSA_CIPHERTEXT_LENGTH_BYTES);
}

/**
 * Encrypt payload into x || E with no marker, key ID, version, or custom length.
 *
 * side-effects: consumes randomness from OpenPGP.js and the platform CSPRNG.
 *
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {string} publicKeyArmored shape ()
 * @param {number} profileEmbeddedLength shape ()
 * @returns {Promise<{embeddedBytes: Uint8Array, profile: GpgContainerProfile}>} embeddedBytes shape (profile.embeddedLength,)
 */
export async function encryptGpgContainer(
  payloadBytes,
  publicKeyArmored,
  profileEmbeddedLength = selectGpgContainerProfile(payloadBytes?.length).embeddedLength,
) {
  if (!(payloadBytes instanceof Uint8Array)) {
    throw new TypeError(`expected Uint8Array payloadBytes, got ${Object.prototype.toString.call(payloadBytes)}`);
  }
  const profile = getGpgContainerProfile(profileEmbeddedLength);
  const paddingLength = findPaddingLength(payloadBytes.length, profile.encryptedSeipdLength);
  if (paddingLength < 0) {
    throw new RangeError(`expected ${payloadBytes.length}-byte payload to fit ${profile.embeddedLength}-byte profile exactly, got no canonical padding length`);
  }
  const { publicKey, encryptionSubkey, modulus } = await readRsa3072EncryptionKey(publicKeyArmored);
  const plaintextMessage = createPlaintextMessage(
    payloadBytes,
    createRandomBytes(paddingLength),
  );
  const encryptedMessage = await openpgp.encrypt({
    message: plaintextMessage,
    encryptionKeys: publicKey,
    format: "object",
    config: ENCRYPTION_CONFIG,
  });
  if (!(encryptedMessage instanceof openpgp.Message) || encryptedMessage.packets.length !== 2) {
    throw new Error(`expected encrypted Message with 2 packets, got ${encryptedMessage?.packets?.length}`);
  }
  const publicKeySessionPacket = encryptedMessage.packets[0];
  const encryptedDataPacket = encryptedMessage.packets[1];
  if (!(publicKeySessionPacket instanceof openpgp.PublicKeyEncryptedSessionKeyPacket)
      || publicKeySessionPacket.version !== 3
      || publicKeySessionPacket.publicKeyID.toHex() !== encryptionSubkey.getKeyID().toHex()) {
    throw new Error(`expected PKESKv3 for actual encryption subkey ${encryptionSubkey.getKeyID().toHex()}, got ${publicKeySessionPacket.constructor.name}`);
  }
  if (publicKeySessionPacket.sessionKeyAlgorithm !== openpgp.enums.symmetric.aes256) {
    throw new Error(`expected AES-256 session key algorithm ${openpgp.enums.symmetric.aes256}, got ${publicKeySessionPacket.sessionKeyAlgorithm}`);
  }
  if (!(encryptedDataPacket instanceof openpgp.SymEncryptedIntegrityProtectedDataPacket)
      || encryptedDataPacket.version !== 1
      || !(encryptedDataPacket.encrypted instanceof Uint8Array)) {
    throw new Error(`expected encrypted SEIPDv1 packet, got ${encryptedDataPacket.constructor.name} v${encryptedDataPacket.version}`);
  }
  if (encryptedDataPacket.encrypted.length !== profile.encryptedSeipdLength) {
    throw new Error(`expected encrypted SEIPD length ${profile.encryptedSeipdLength}, got ${encryptedDataPacket.encrypted.length}`);
  }
  const liftedCiphertext = liftRsaCiphertext(publicKeySessionPacket.encrypted.c, modulus);
  const embeddedBytes = concatenateBytes([liftedCiphertext, encryptedDataPacket.encrypted]);
  if (embeddedBytes.length !== profile.embeddedLength) {
    throw new Error(`expected embedded length ${profile.embeddedLength}, got ${embeddedBytes.length}`);
  }
  return { embeddedBytes, profile };
}

/**
 * Rebuild standard binary PKESKv3 plus SEIPDv1 bytes without a private key.
 *
 * @param {Uint8Array} embeddedBytes shape (profile.embeddedLength,)
 * @param {string} publicKeyArmored shape ()
 * @param {number} profileEmbeddedLength shape ()
 * @returns {Promise<Uint8Array>} shape (standardMessageLength,)
 */
export async function rebuildGpgContainerMessage(
  embeddedBytes,
  publicKeyArmored,
  profileEmbeddedLength,
) {
  if (!(embeddedBytes instanceof Uint8Array)) {
    throw new TypeError(`expected Uint8Array embeddedBytes, got ${Object.prototype.toString.call(embeddedBytes)}`);
  }
  const profile = getGpgContainerProfile(profileEmbeddedLength);
  if (embeddedBytes.length !== profile.embeddedLength) {
    throw new RangeError(`expected embedded length ${profile.embeddedLength}, got ${embeddedBytes.length}`);
  }
  const { encryptionSubkey } = await readRsa3072EncryptionKey(publicKeyArmored);
  const rsaCiphertextBytes = await recoverGpgContainerRsaCiphertext(
    embeddedBytes,
    publicKeyArmored,
    profileEmbeddedLength,
  );
  const publicKeySessionPacket = new openpgp.PublicKeyEncryptedSessionKeyPacket();
  publicKeySessionPacket.version = 3;
  publicKeySessionPacket.publicKeyID = encryptionSubkey.getKeyID();
  publicKeySessionPacket.publicKeyAlgorithm = encryptionSubkey.keyPacket.algorithm;
  publicKeySessionPacket.encrypted = { c: rsaCiphertextBytes };
  const encryptedDataPacket = new openpgp.SymEncryptedIntegrityProtectedDataPacket();
  encryptedDataPacket.version = 1;
  encryptedDataPacket.encrypted = embeddedBytes.slice(LIFTED_RSA_LENGTH_BYTES);
  const standardMessage = new openpgp.Message(
    new openpgp.PacketList(publicKeySessionPacket, encryptedDataPacket),
  );
  const standardMessageBytes = standardMessage.write();
  if (!(standardMessageBytes instanceof Uint8Array)) {
    throw new Error(`expected Uint8Array standard message, got ${Object.prototype.toString.call(standardMessageBytes)}`);
  }
  return standardMessageBytes;
}

/** Fixed profiles are defined by markerless embedded length, not exported PGP length. */
export const GPG_CONTAINER_PROFILES = Object.freeze(EMBEDDED_LENGTHS_BYTES.map((embeddedLength) => {
  const encryptedSeipdLength = embeddedLength - LIFTED_RSA_LENGTH_BYTES;
  return Object.freeze({
    embeddedLength,
    encryptedSeipdLength,
    maxPayloadLength: calculateMaxPayloadLength(encryptedSeipdLength),
  });
}));
