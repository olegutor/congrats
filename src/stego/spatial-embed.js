/**
 * Spatial HILL + STC embedding into blue-channel LSBs of RGBA ImageData.
 *
 * Side-channel header (raw LSBs of the first HEADER_PIXEL_COUNT scan-order pixels):
 *   magic "CS" (16) || version (8) || messageBitCount (24) || reserved (8) = 56 bits
 * Those pixels are excluded from the STC cover (wet paper).
 *
 * Cover positions are a keyed permutation prefix (not cost-ranked), so encoder and
 * decoder agree after ±1 embedding. HILL costs only weight STC distortion.
 */

import { computeHillCosts } from "./hill-costs.js";
import { fisherYatesPermutation } from "./prng.js";
import { stcEmbed, stcExtract, STC_DEFAULT_HEIGHT } from "./stc.js";

/** Protocol version for the spatial header. */
export const SPATIAL_STEGO_VERSION = 1;

/** ASCII 'C','S'. */
const HEADER_MAGIC_0 = 0x43;
const HEADER_MAGIC_1 = 0x53;

/** Bits stored in the raw LSB side-channel. */
const HEADER_BIT_COUNT = 56;

/** One blue-channel LSB per header bit. */
export const HEADER_PIXEL_COUNT = HEADER_BIT_COUNT;

/** Target embedding rate α = m/n for sizing the STC cover. */
export const TARGET_EMBEDDING_RATE = 0.1;

/** Public seed domain for H-hat (confidentiality lives in crypto layer). */
export const HHAT_SEED_LABEL = "congrads_steg_hhat_v1";

/** Public seed domain for cover permutation. */
export const PERM_SEED_LABEL = "congrads_steg_perm_v1";

/** Blue channel offset in RGBA. */
const BLUE_CHANNEL_OFFSET = 2;

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
 * @returns {SpatialEmbedStats}
 */
export function embedBitsIntoImageData(imageData, messageBits) {
  assertBitArray(messageBits, "messageBits");
  if (messageBits.length < 1) {
    throw new Error(`expected messageBits.length >= 1, got ${messageBits.length}`);
  }
  if (messageBits.length >= 1 << 24) {
    throw new Error(`expected messageBits.length < 2^24, got ${messageBits.length}`);
  }

  const { width, height, data } = imageData;
  const pixelCount = width * height;
  if (pixelCount <= HEADER_PIXEL_COUNT + 64) {
    throw new Error(
      `image too small: ${width}x${height} pixels, need > ${HEADER_PIXEL_COUNT + 64}`,
    );
  }

  const hillCosts = computeHillCosts(imageData);
  const coverBitCount = selectCoverBitCount(
    messageBits.length,
    pixelCount - HEADER_PIXEL_COUNT,
  );
  const orderedIndices = buildPermutedCoverIndices(pixelCount, coverBitCount);

  const coverBits = new Uint8Array(coverBitCount);
  const costs = new Float64Array(coverBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    const pixelIndex = orderedIndices[coverIndex];
    const blueValue = data[pixelIndex * 4 + BLUE_CHANNEL_OFFSET];
    coverBits[coverIndex] = blueValue & 1;
    costs[coverIndex] = hillCosts[pixelIndex];
  }

  const hHatSeed = new TextEncoder().encode(HHAT_SEED_LABEL);
  const { stegoBits, totalDistortion, changedCount } = stcEmbed(
    coverBits,
    costs,
    messageBits,
    hHatSeed,
    STC_DEFAULT_HEIGHT,
  );

  writeHeaderBits(data, messageBits.length);

  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    if (stegoBits[coverIndex] === coverBits[coverIndex]) {
      continue;
    }
    const pixelIndex = orderedIndices[coverIndex];
    const byteOffset = pixelIndex * 4 + BLUE_CHANNEL_OFFSET;
    data[byteOffset] = flipBlueLsbMatching(data[byteOffset]);
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
 * @returns {Uint8Array} shape (messageBitCount,) values in {0,1}
 */
export function extractBitsFromImageData(imageData) {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  if (pixelCount <= HEADER_PIXEL_COUNT + 64) {
    throw new Error(
      `image too small: ${width}x${height} pixels, need > ${HEADER_PIXEL_COUNT + 64}`,
    );
  }

  const messageBitCount = readHeaderMessageBitCount(data);
  const coverBitCount = selectCoverBitCount(
    messageBitCount,
    pixelCount - HEADER_PIXEL_COUNT,
  );
  const orderedIndices = buildPermutedCoverIndices(pixelCount, coverBitCount);

  const stegoBits = new Uint8Array(coverBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    const pixelIndex = orderedIndices[coverIndex];
    stegoBits[coverIndex] = data[pixelIndex * 4 + BLUE_CHANNEL_OFFSET] & 1;
  }

  const hHatSeed = new TextEncoder().encode(HHAT_SEED_LABEL);
  return stcExtract(stegoBits, messageBitCount, hHatSeed, STC_DEFAULT_HEIGHT);
}

/**
 * Estimate maximum message bit capacity for an image size.
 *
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function estimateMaxMessageBits(width, height) {
  const candidateCount = Math.max(0, width * height - HEADER_PIXEL_COUNT);
  return Math.floor(candidateCount * TARGET_EMBEDDING_RATE);
}

/**
 * Permute all non-header pixels, take the first coverBitCount as the STC cover.
 *
 * @param {number} pixelCount
 * @param {number} coverBitCount
 * @returns {Uint32Array} shape (coverBitCount,)
 */
function buildPermutedCoverIndices(pixelCount, coverBitCount) {
  const candidateCount = pixelCount - HEADER_PIXEL_COUNT;
  if (coverBitCount > candidateCount) {
    throw new Error(
      `expected coverBitCount <= ${candidateCount}, got ${coverBitCount}`,
    );
  }
  const permSeed = new TextEncoder().encode(PERM_SEED_LABEL);
  const permutation = fisherYatesPermutation(candidateCount, permSeed);
  const orderedIndices = new Uint32Array(coverBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    orderedIndices[coverIndex] = HEADER_PIXEL_COUNT + permutation[coverIndex];
  }
  return orderedIndices;
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @param {number} messageBitCount
 * @returns {void}
 */
function writeHeaderBits(rgbaData, messageBitCount) {
  const headerBits = new Uint8Array(HEADER_BIT_COUNT);
  writeByteBits(headerBits, 0, HEADER_MAGIC_0);
  writeByteBits(headerBits, 8, HEADER_MAGIC_1);
  writeByteBits(headerBits, 16, SPATIAL_STEGO_VERSION);
  for (let shift = 23; shift >= 0; shift -= 1) {
    headerBits[24 + (23 - shift)] = (messageBitCount >>> shift) & 1;
  }

  for (let bitIndex = 0; bitIndex < HEADER_BIT_COUNT; bitIndex += 1) {
    const byteOffset = bitIndex * 4 + BLUE_CHANNEL_OFFSET;
    const current = rgbaData[byteOffset];
    const desiredBit = headerBits[bitIndex];
    if ((current & 1) !== desiredBit) {
      rgbaData[byteOffset] = flipBlueLsbMatching(current);
    }
  }
}

/**
 * @param {Uint8ClampedArray | Uint8Array} rgbaData
 * @returns {number}
 */
function readHeaderMessageBitCount(rgbaData) {
  const headerBits = new Uint8Array(HEADER_BIT_COUNT);
  for (let bitIndex = 0; bitIndex < HEADER_BIT_COUNT; bitIndex += 1) {
    headerBits[bitIndex] = rgbaData[bitIndex * 4 + BLUE_CHANNEL_OFFSET] & 1;
  }
  const magic0 = readByteBits(headerBits, 0);
  const magic1 = readByteBits(headerBits, 8);
  if (magic0 !== HEADER_MAGIC_0 || magic1 !== HEADER_MAGIC_1) {
    throw new Error(
      `stego header magic mismatch: expected CS (0x43 0x53), got 0x${magic0.toString(16)} 0x${magic1.toString(16)}`,
    );
  }
  const version = readByteBits(headerBits, 16);
  if (version !== SPATIAL_STEGO_VERSION) {
    throw new Error(`unsupported stego version ${version}, expected ${SPATIAL_STEGO_VERSION}`);
  }
  let messageBitCount = 0;
  for (let bitIndex = 24; bitIndex < 48; bitIndex += 1) {
    messageBitCount = (messageBitCount << 1) | headerBits[bitIndex];
  }
  if (messageBitCount < 1) {
    throw new Error(`expected messageBitCount >= 1 from header, got ${messageBitCount}`);
  }
  return messageBitCount;
}

/**
 * @param {Uint8Array} bitArray
 * @param {number} startBitIndex
 * @param {number} byteValue
 * @returns {void}
 */
function writeByteBits(bitArray, startBitIndex, byteValue) {
  for (let shift = 7; shift >= 0; shift -= 1) {
    bitArray[startBitIndex + (7 - shift)] = (byteValue >> shift) & 1;
  }
}

/**
 * @param {Uint8Array} bitArray
 * @param {number} startBitIndex
 * @returns {number}
 */
function readByteBits(bitArray, startBitIndex) {
  let byteValue = 0;
  for (let offset = 0; offset < 8; offset += 1) {
    byteValue = (byteValue << 1) | bitArray[startBitIndex + offset];
  }
  return byteValue;
}

/**
 * @param {number} messageBitCount
 * @param {number} candidateCount
 * @returns {number}
 */
function selectCoverBitCount(messageBitCount, candidateCount) {
  const needed = Math.ceil(messageBitCount / TARGET_EMBEDDING_RATE);
  const withMargin = Math.max(needed, messageBitCount * 2 + 64);
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
function flipBlueLsbMatching(channelValue) {
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
