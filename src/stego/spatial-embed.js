/**
 * Spatial HILL + STC embedding into passphrase-keyed RGB-channel LSBs.
 *
 * A salt is derived from pixel bits that embedding never changes. The message
 * length is masked and placed at passphrase-keyed positions. No public magic,
 * version, salt field, or parseable length is embedded.
 *
 * Cover positions are a keyed permutation prefix (not cost-ranked), so encoder and
 * decoder agree after ±1 embedding. HILL costs only weight STC distortion.
 */

import { computeHillCosts } from "./hill-costs.js";
import { fisherYatesPermutation, shakeExpand } from "./prng.js";
import { stcEmbed, stcExtract, STC_DEFAULT_HEIGHT } from "./stc.js";

/** Cover-derived salt size in bytes. */
const SALT_BYTE_COUNT = 16;

/** Masked unsigned message length size. */
const LENGTH_BIT_COUNT = 24;

/** Pixels unavailable to the STC payload. */
export const HEADER_PIXEL_COUNT = LENGTH_BIT_COUNT;

const HEADER_PERMUTATION_DOMAIN = "spatial-header-permutation";
const LENGTH_MASK_DOMAIN = "spatial-length-mask";
const HHAT_DOMAIN = "spatial-hhat";
const EMBEDDING_RATE_DOMAIN = "spatial-embedding-rate";

/** RGB channels available for keyed carrier selection. */
const CARRIER_CHANNEL_OFFSETS = new Uint8Array([0, 1, 2]);

/** Keyed embedding-rate interval. Capacity uses the lower bound. */
const MIN_SUBMATRIX_WIDTH = 8;
const MAX_SUBMATRIX_WIDTH = 14;
export const MIN_TARGET_EMBEDDING_RATE = 1 / MAX_SUBMATRIX_WIDTH;
export const MAX_TARGET_EMBEDDING_RATE = 1 / MIN_SUBMATRIX_WIDTH;

/**
 * @typedef {object} SpatialEmbedStats
 * @property {number} messageBitCount
 * @property {number} coverBitCount
 * @property {number} changedCount
 * @property {number} totalDistortion
 * @property {number} embeddingRate
 */

/**
 * Embed message bits into imageData (mutates pixels in place).
 *
 * side-effects: mutates imageData.data
 *
 * @param {ImageData} imageData
 * @param {Uint8Array} messageBits shape (m,) values in {0,1}
 * @param {string} stegoPassphrase
 * @returns {SpatialEmbedStats}
 */
export function embedBitsIntoImageData(imageData, messageBits, stegoPassphrase) {
  assertBitArray(messageBits, "messageBits");
  assertStegoPassphrase(stegoPassphrase);
  if (messageBits.length < 1) {
    throw new Error(`expected messageBits.length >= 1, got ${messageBits.length}`);
  }
  if (messageBits.length >= 1 << 24) {
    throw new Error(`expected messageBits.length < 2^24, got ${messageBits.length}`);
  }

  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const carrierCount = pixelCount * CARRIER_CHANNEL_OFFSETS.length;
  if (carrierCount <= HEADER_PIXEL_COUNT + 64) {
    throw new Error(
      `image too small: ${width}x${height} pixels, got ${carrierCount} RGB carriers`,
    );
  }

  const saltBytes = deriveImageSalt(data, width, height);
  const keyedLayout = buildKeyedLayout(carrierCount, stegoPassphrase, saltBytes);
  const hillCosts = computeHillCosts(imageData);
  const coverBitCount = selectCoverBitCount(
    messageBits.length,
    carrierCount - HEADER_PIXEL_COUNT,
    keyedLayout.targetEmbeddingRate,
  );
  const orderedIndices = keyedLayout.payloadIndices.slice(0, coverBitCount);

  const coverBits = new Uint8Array(coverBitCount);
  const costs = new Float64Array(coverBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    const carrierIndex = orderedIndices[coverIndex];
    const pixelIndex = carrierIndexToPixelIndex(carrierIndex);
    coverBits[coverIndex] = readCarrierLsb(data, carrierIndex);
    costs[coverIndex] = hillCosts[pixelIndex];
  }

  const { stegoBits, totalDistortion, changedCount } = stcEmbed(
    coverBits,
    costs,
    messageBits,
    keyedLayout.hHatSeed,
    STC_DEFAULT_HEIGHT,
  );

  writeConcealedHeader(data, messageBits.length, keyedLayout);

  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    if (stegoBits[coverIndex] === coverBits[coverIndex]) {
      continue;
    }
    flipCarrierLsb(data, orderedIndices[coverIndex]);
  }

  return {
    messageBitCount: messageBits.length,
    coverBitCount,
    changedCount,
    totalDistortion,
    embeddingRate: messageBits.length / coverBitCount,
  };
}

/**
 * Extract message bits from stego ImageData.
 *
 * @param {ImageData} imageData
 * @param {string} stegoPassphrase
 * @returns {Uint8Array} shape (messageBitCount,) values in {0,1}
 */
export function extractBitsFromImageData(imageData, stegoPassphrase) {
  assertStegoPassphrase(stegoPassphrase);
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const carrierCount = pixelCount * CARRIER_CHANNEL_OFFSETS.length;
  if (carrierCount <= HEADER_PIXEL_COUNT + 64) {
    throw new Error(
      `image too small: ${width}x${height} pixels, got ${carrierCount} RGB carriers`,
    );
  }

  const saltBytes = deriveImageSalt(data, width, height);
  const keyedLayout = buildKeyedLayout(carrierCount, stegoPassphrase, saltBytes);
  const messageBitCount = readConcealedMessageBitCount(data, keyedLayout);
  const coverBitCount = selectCoverBitCount(
    messageBitCount,
    carrierCount - HEADER_PIXEL_COUNT,
    keyedLayout.targetEmbeddingRate,
  );
  const orderedIndices = keyedLayout.payloadIndices.slice(0, coverBitCount);

  const stegoBits = new Uint8Array(coverBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    stegoBits[coverIndex] = readCarrierLsb(data, orderedIndices[coverIndex]);
  }

  return stcExtract(stegoBits, messageBitCount, keyedLayout.hHatSeed, STC_DEFAULT_HEIGHT);
}

/**
 * Embed an externally sized message without writing a concealed length field.
 *
 * side-effects: mutates imageData.data
 *
 * @param {ImageData} imageData
 * @param {Uint8Array} messageBits shape (messageBitCount,) values in {0,1}
 * @param {string | Uint8Array} channelKey externally derived channel key
 * @returns {SpatialEmbedStats}
 */
export function embedFixedBitsIntoImageData(imageData, messageBits, channelKey) {
  assertBitArray(messageBits, "messageBits");
  assertChannelKey(channelKey);
  if (messageBits.length < 1) {
    throw new Error(`expected messageBits.length >= 1, got ${messageBits.length}`);
  }

  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const carrierCount = pixelCount * CARRIER_CHANNEL_OFFSETS.length;
  if (carrierCount <= 64) {
    throw new Error(
      `image too small: ${width}x${height} pixels, got ${carrierCount} RGB carriers`,
    );
  }

  const saltBytes = deriveImageSalt(data, width, height);
  const keyedLayout = buildFixedKeyedLayout(carrierCount, channelKey, saltBytes);
  const hillCosts = computeHillCosts(imageData);
  const coverBitCount = selectCoverBitCount(
    messageBits.length,
    carrierCount,
    keyedLayout.targetEmbeddingRate,
  );
  const orderedIndices = keyedLayout.payloadIndices.slice(0, coverBitCount);
  const coverBits = new Uint8Array(coverBitCount);
  const costs = new Float64Array(coverBitCount);

  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    const carrierIndex = orderedIndices[coverIndex];
    const pixelIndex = carrierIndexToPixelIndex(carrierIndex);
    coverBits[coverIndex] = readCarrierLsb(data, carrierIndex);
    costs[coverIndex] = hillCosts[pixelIndex];
  }

  const { stegoBits, totalDistortion, changedCount } = stcEmbed(
    coverBits,
    costs,
    messageBits,
    keyedLayout.hHatSeed,
    STC_DEFAULT_HEIGHT,
  );
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    if (stegoBits[coverIndex] !== coverBits[coverIndex]) {
      flipCarrierLsb(data, orderedIndices[coverIndex]);
    }
  }

  return {
    messageBitCount: messageBits.length,
    coverBitCount,
    changedCount,
    totalDistortion,
    embeddingRate: messageBits.length / coverBitCount,
  };
}

/**
 * Extract exactly the caller-requested number of message bits without checking
 * for a header, marker, profile, or other validity field.
 *
 * @param {ImageData} imageData
 * @param {string | Uint8Array} channelKey externally derived channel key
 * @param {number} messageBitCount
 * @returns {Uint8Array} shape (messageBitCount,) values in {0,1}
 */
export function extractFixedBitsFromImageData(imageData, channelKey, messageBitCount) {
  assertChannelKey(channelKey);
  assertMessageBitCount(messageBitCount);
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const carrierCount = pixelCount * CARRIER_CHANNEL_OFFSETS.length;
  if (carrierCount <= 64) {
    throw new Error(
      `image too small: ${width}x${height} pixels, got ${carrierCount} RGB carriers`,
    );
  }

  const saltBytes = deriveImageSalt(data, width, height);
  const keyedLayout = buildFixedKeyedLayout(carrierCount, channelKey, saltBytes);
  const coverBitCount = selectCoverBitCount(
    messageBitCount,
    carrierCount,
    keyedLayout.targetEmbeddingRate,
  );
  const orderedIndices = keyedLayout.payloadIndices.slice(0, coverBitCount);
  const stegoBits = new Uint8Array(coverBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    stegoBits[coverIndex] = readCarrierLsb(data, orderedIndices[coverIndex]);
  }

  return stcExtract(stegoBits, messageBitCount, keyedLayout.hHatSeed, STC_DEFAULT_HEIGHT);
}

/**
 * Estimate maximum message bit capacity for an image size.
 *
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function estimateMaxMessageBits(width, height) {
  const candidateCount = Math.max(
    0,
    width * height * CARRIER_CHANNEL_OFFSETS.length - HEADER_PIXEL_COUNT,
  );
  return Math.floor(candidateCount * MIN_TARGET_EMBEDDING_RATE);
}

/**
 * Build passphrase- and salt-keyed header and payload positions.
 *
 * @param {number} carrierCount
 * @param {string} stegoPassphrase
 * @param {Uint8Array} saltBytes shape (16,)
 * @returns {{
 *   lengthIndices: Uint32Array,
 *   payloadIndices: Uint32Array,
 *   lengthMask: Uint8Array,
 *   hHatSeed: Uint8Array,
 *   targetEmbeddingRate: number
 * }}
 */
function buildKeyedLayout(carrierCount, stegoPassphrase, saltBytes) {
  const candidateCount = carrierCount;
  const permutationSeed = buildDomainSeed(stegoPassphrase, saltBytes, HEADER_PERMUTATION_DOMAIN);
  const permutation = fisherYatesPermutation(candidateCount, permutationSeed);
  const lengthIndices = new Uint32Array(LENGTH_BIT_COUNT);
  for (let bitIndex = 0; bitIndex < LENGTH_BIT_COUNT; bitIndex += 1) {
    lengthIndices[bitIndex] = permutation[bitIndex];
  }
  const payloadIndices = new Uint32Array(candidateCount - LENGTH_BIT_COUNT);
  for (let index = 0; index < payloadIndices.length; index += 1) {
    payloadIndices[index] = permutation[LENGTH_BIT_COUNT + index];
  }
  return {
    lengthIndices,
    payloadIndices,
    lengthMask: shakeExpand(
      buildDomainSeed(stegoPassphrase, saltBytes, LENGTH_MASK_DOMAIN),
      LENGTH_BIT_COUNT,
    ),
    hHatSeed: buildDomainSeed(stegoPassphrase, saltBytes, HHAT_DOMAIN),
    targetEmbeddingRate: deriveTargetEmbeddingRate(stegoPassphrase, saltBytes),
  };
}

/**
 * Build a key- and salt-derived fixed-length payload layout over all RGB carriers.
 *
 * @param {number} carrierCount
 * @param {string | Uint8Array} channelKey
 * @param {Uint8Array} saltBytes shape (16,)
 * @returns {{
 *   payloadIndices: Uint32Array,
 *   hHatSeed: Uint8Array,
 *   targetEmbeddingRate: number
 * }}
 */
function buildFixedKeyedLayout(carrierCount, channelKey, saltBytes) {
  const payloadIndices = fisherYatesPermutation(
    carrierCount,
    buildDomainSeed(channelKey, saltBytes, HEADER_PERMUTATION_DOMAIN),
  );
  return {
    payloadIndices,
    hHatSeed: buildDomainSeed(channelKey, saltBytes, HHAT_DOMAIN),
    targetEmbeddingRate: deriveTargetEmbeddingRate(channelKey, saltBytes),
  };
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @param {number} messageBitCount
 * @param {{ lengthIndices: Uint32Array, lengthMask: Uint8Array }} keyedLayout
 * @returns {void}
 */
function writeConcealedHeader(rgbaData, messageBitCount, keyedLayout) {
  const lengthBits = new Uint8Array(LENGTH_BIT_COUNT);
  for (let shift = 23; shift >= 0; shift -= 1) {
    lengthBits[23 - shift] = (messageBitCount >>> shift) & 1;
  }
  for (let bitIndex = 0; bitIndex < LENGTH_BIT_COUNT; bitIndex += 1) {
    const concealedBit = lengthBits[bitIndex] ^ (keyedLayout.lengthMask[bitIndex] & 1);
    writeCarrierLsb(rgbaData, keyedLayout.lengthIndices[bitIndex], concealedBit);
  }
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @param {{ lengthIndices: Uint32Array, lengthMask: Uint8Array }} keyedLayout
 * @returns {number}
 */
function readConcealedMessageBitCount(rgbaData, keyedLayout) {
  let messageBitCount = 0;
  for (let bitIndex = 0; bitIndex < LENGTH_BIT_COUNT; bitIndex += 1) {
    const concealedBit = readCarrierLsb(rgbaData, keyedLayout.lengthIndices[bitIndex]);
    const lengthBit = concealedBit ^ (keyedLayout.lengthMask[bitIndex] & 1);
    messageBitCount = (messageBitCount << 1) | lengthBit;
  }
  if (messageBitCount < 1) {
    throw new Error(`invalid stego passphrase or image: decoded bit count ${messageBitCount}`);
  }
  return messageBitCount;
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @param {number} carrierIndex
 * @param {number} desiredBit
 * @returns {void}
 */
function writeCarrierLsb(rgbaData, carrierIndex, desiredBit) {
  const byteOffset = carrierIndexToByteOffset(carrierIndex);
  const current = rgbaData[byteOffset];
  if ((current & 1) !== desiredBit) {
    rgbaData[byteOffset] = flipChannelLsbMatching(current);
  }
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @param {number} carrierIndex
 * @returns {number}
 */
function readCarrierLsb(rgbaData, carrierIndex) {
  return rgbaData[carrierIndexToByteOffset(carrierIndex)] & 1;
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @param {number} carrierIndex
 * @returns {void}
 */
function flipCarrierLsb(rgbaData, carrierIndex) {
  const byteOffset = carrierIndexToByteOffset(carrierIndex);
  rgbaData[byteOffset] = flipChannelLsbMatching(rgbaData[byteOffset]);
}

/**
 * @param {number} carrierIndex
 * @returns {number}
 */
function carrierIndexToPixelIndex(carrierIndex) {
  return Math.floor(carrierIndex / CARRIER_CHANNEL_OFFSETS.length);
}

/**
 * @param {number} carrierIndex
 * @returns {number}
 */
function carrierIndexToByteOffset(carrierIndex) {
  const pixelIndex = carrierIndexToPixelIndex(carrierIndex);
  const channelIndex = carrierIndex % CARRIER_CHANNEL_OFFSETS.length;
  return pixelIndex * 4 + CARRIER_CHANNEL_OFFSETS[channelIndex];
}

/**
 * @param {string | Uint8Array} channelKey
 * @param {Uint8Array} saltBytes shape (16,)
 * @param {string} domain
 * @returns {Uint8Array}
 */
function buildDomainSeed(channelKey, saltBytes, domain) {
  const channelKeyBytes = typeof channelKey === "string"
    ? new TextEncoder().encode(channelKey)
    : channelKey;
  const domainBytes = new TextEncoder().encode(domain);
  const seedBytes = new Uint8Array(channelKeyBytes.length + saltBytes.length + domainBytes.length);
  seedBytes.set(channelKeyBytes, 0);
  seedBytes.set(saltBytes, channelKeyBytes.length);
  seedBytes.set(domainBytes, channelKeyBytes.length + saltBytes.length);
  return seedBytes;
}

/**
 * @param {string | Uint8Array} channelKey
 * @param {Uint8Array} saltBytes shape (16,)
 * @returns {number}
 */
function deriveTargetEmbeddingRate(channelKey, saltBytes) {
  const rateByte = shakeExpand(
    buildDomainSeed(channelKey, saltBytes, EMBEDDING_RATE_DOMAIN),
    1,
  )[0];
  const widthRange = MAX_SUBMATRIX_WIDTH - MIN_SUBMATRIX_WIDTH + 1;
  const submatrixWidth = MIN_SUBMATRIX_WIDTH + (rateByte % widthRange);
  return 1 / submatrixWidth;
}

/**
 * Derive a stable per-image salt from dimensions and pixel bits that RGB-LSB
 * embedding leaves untouched.
 *
 * @param {Uint8ClampedArray | Uint8Array} rgbaData shape (width * height * 4,)
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} shape (16,)
 */
function deriveImageSalt(rgbaData, width, height) {
  const stableBytes = new Uint8Array(8 + rgbaData.length);
  const dimensionsView = new DataView(stableBytes.buffer);
  dimensionsView.setUint32(0, width, false);
  dimensionsView.setUint32(4, height, false);
  for (let byteOffset = 0; byteOffset < rgbaData.length; byteOffset += 4) {
    stableBytes[8 + byteOffset] = rgbaData[byteOffset] & 0xfe;
    stableBytes[8 + byteOffset + 1] = rgbaData[byteOffset + 1] & 0xfe;
    stableBytes[8 + byteOffset + 2] = rgbaData[byteOffset + 2] & 0xfe;
    stableBytes[8 + byteOffset + 3] = rgbaData[byteOffset + 3];
  }
  return shakeExpand(stableBytes, SALT_BYTE_COUNT);
}

/**
 * @param {number} messageBitCount
 * @param {number} candidateCount
 * @returns {number}
 */
function selectCoverBitCount(messageBitCount, candidateCount, targetEmbeddingRate) {
  if (
    !Number.isFinite(targetEmbeddingRate)
    || targetEmbeddingRate < MIN_TARGET_EMBEDDING_RATE
    || targetEmbeddingRate > MAX_TARGET_EMBEDDING_RATE
  ) {
    throw new Error(
      `expected targetEmbeddingRate in [${MIN_TARGET_EMBEDDING_RATE}, `
        + `${MAX_TARGET_EMBEDDING_RATE}], got ${targetEmbeddingRate}`,
    );
  }
  const needed = Math.ceil(messageBitCount / targetEmbeddingRate);
  const initialCoverBitCount = Math.max(needed, messageBitCount * 2 + 64);
  const submatrixWidth = Math.ceil(initialCoverBitCount / messageBitCount);
  const withMargin = messageBitCount * submatrixWidth;
  if (withMargin > candidateCount) {
    throw new Error(
      `payload too large for image: need ~${withMargin} cover bits for ${messageBitCount} message bits, `
        + `have ${candidateCount} candidate pixels`,
    );
  }
  return withMargin;
}

/**
 * LSB matching (±1) that flips the LSB and stays in 0..255.
 *
 * @param {number} channelValue
 * @returns {number}
 */
function flipChannelLsbMatching(channelValue) {
  if (channelValue <= 0) {
    return 1;
  }
  if (channelValue >= 255) {
    return 254;
  }
  if ((channelValue & 1) === 0) {
    return channelValue + 1;
  }
  return channelValue - 1;
}

/**
 * @param {Uint8Array} bits
 * @param {string} name
 * @returns {void}
 */
function assertBitArray(bits, name) {
  if (!(bits instanceof Uint8Array)) {
    throw new Error(`expected ${name} Uint8Array, got ${Object.prototype.toString.call(bits)}`);
  }
  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index] !== 0 && bits[index] !== 1) {
      throw new Error(`expected ${name}[${index}] in {0,1}, got ${bits[index]}`);
    }
  }
}

/**
 * @param {string} stegoPassphrase
 * @returns {void}
 */
function assertStegoPassphrase(stegoPassphrase) {
  if (typeof stegoPassphrase !== "string" || stegoPassphrase.length === 0) {
    throw new Error("expected non-empty stego passphrase");
  }
}

/**
 * @param {string | Uint8Array} channelKey
 * @returns {void}
 */
function assertChannelKey(channelKey) {
  const isNonEmptyString = typeof channelKey === "string" && channelKey.length > 0;
  const isNonEmptyByteArray = channelKey instanceof Uint8Array && channelKey.length > 0;
  if (!isNonEmptyString && !isNonEmptyByteArray) {
    throw new Error(
      `expected channelKey to be a non-empty string or Uint8Array, `
        + `got ${Object.prototype.toString.call(channelKey)}`,
    );
  }
}

/**
 * @param {number} messageBitCount
 * @returns {void}
 */
function assertMessageBitCount(messageBitCount) {
  if (!Number.isInteger(messageBitCount) || messageBitCount < 1) {
    throw new Error(`expected messageBitCount to be an integer >= 1, got ${messageBitCount}`);
  }
}
