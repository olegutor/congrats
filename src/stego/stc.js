/**
 * Binary Syndrome-Trellis Codes (Filler, Judas, Fridrich 2011).
 * Constraint height h=7; H-hat from SHAKE-256; windowed Viterbi for memory.
 */

import { shakeExpand } from "./prng.js";

/** Default constraint height (128 trellis states). */
export const STC_DEFAULT_HEIGHT = 7;

/** Infinity stand-in for unreachable trellis states. */
const COST_INFINITY = Number.POSITIVE_INFINITY;

/**
 * @typedef {object} StcEmbedResult
 * @property {Uint8Array} stegoBits shape (coverBitCount,) values in {0,1}
 * @property {number} totalDistortion
 * @property {number} changedCount
 */

/**
 * Generate H-hat columns with odd column weight (design rule 1).
 *
 * @param {Uint8Array} seedBytes shape (seedLength,)
 * @param {number} constraintHeight h
 * @param {number} submatrixWidth w
 * @returns {Uint32Array} shape (w,) each column packed in low h bits
 */
export function generateHHatColumns(seedBytes, constraintHeight, submatrixWidth) {
  assertHeight(constraintHeight);
  if (!Number.isInteger(submatrixWidth) || submatrixWidth < 1) {
    throw new Error(`expected submatrixWidth >= 1, got ${submatrixWidth}`);
  }
  const randomBytes = shakeExpand(seedBytes, submatrixWidth * constraintHeight);
  const columns = new Uint32Array(submatrixWidth);
  let byteOffset = 0;
  for (let columnIndex = 0; columnIndex < submatrixWidth; columnIndex += 1) {
    let columnBits = 0;
    let oneCount = 0;
    for (let bitIndex = 0; bitIndex < constraintHeight; bitIndex += 1) {
      const randomBit = randomBytes[byteOffset] & 1;
      byteOffset += 1;
      if (randomBit === 1) {
        columnBits |= 1 << bitIndex;
        oneCount += 1;
      }
    }
    if ((oneCount & 1) === 0) {
      columnBits ^= 1;
    }
    columns[columnIndex] = columnBits;
  }
  return columns;
}

/**
 * Embed message bits into cover LSBs minimizing additive distortion.
 *
 * @param {Uint8Array} coverBits shape (n,) values in {0,1}
 * @param {Float64Array} costs shape (n,)
 * @param {Uint8Array} messageBits shape (m,) values in {0,1}
 * @param {Uint8Array} hHatSeed shape (seedLength,)
 * @param {number} [constraintHeight]
 * @returns {StcEmbedResult}
 */
export function stcEmbed(
  coverBits,
  costs,
  messageBits,
  hHatSeed,
  constraintHeight = STC_DEFAULT_HEIGHT,
) {
  const coverBitCount = coverBits.length;
  const messageBitCount = messageBits.length;
  assertBitArray(coverBits, "coverBits");
  assertBitArray(messageBits, "messageBits");
  if (costs.length !== coverBitCount) {
    throw new Error(
      `expected costs.length === coverBits.length (${coverBitCount}), got ${costs.length}`,
    );
  }
  if (messageBitCount < 1) {
    throw new Error(`expected messageBitCount >= 1, got ${messageBitCount}`);
  }
  if (messageBitCount >= coverBitCount) {
    throw new Error(
      `expected messageBitCount < coverBitCount, got m=${messageBitCount}, n=${coverBitCount}`,
    );
  }
  const submatrixWidth = Math.ceil(coverBitCount / messageBitCount);
  if (submatrixWidth < 2) {
    throw new Error(`expected submatrixWidth >= 2, got ${submatrixWidth}`);
  }
  const emittedDuringForward = coverBitCount > 0
    ? Math.floor((coverBitCount - 1) / submatrixWidth)
    : 0;
  const remainingBitCount = messageBitCount - emittedDuringForward;
  if (remainingBitCount < 0 || remainingBitCount > constraintHeight) {
    throw new Error(
      `message length incompatible with cover: m=${messageBitCount}, n=${coverBitCount}, `
        + `w=${submatrixWidth}, h=${constraintHeight}, remaining=${remainingBitCount}`,
    );
  }
  const hHatColumns = generateHHatColumns(hHatSeed, constraintHeight, submatrixWidth);
  return viterbiEmbed(coverBits, costs, messageBits, hHatColumns, constraintHeight, submatrixWidth);
}

/**
 * Extract message bits as syndrome H · y (mod 2).
 *
 * @param {Uint8Array} stegoBits shape (n,) values in {0,1}
 * @param {number} messageBitCount
 * @param {Uint8Array} hHatSeed shape (seedLength,)
 * @param {number} [constraintHeight]
 * @returns {Uint8Array} shape (messageBitCount,) values in {0,1}
 */
export function stcExtract(
  stegoBits,
  messageBitCount,
  hHatSeed,
  constraintHeight = STC_DEFAULT_HEIGHT,
) {
  assertBitArray(stegoBits, "stegoBits");
  if (!Number.isInteger(messageBitCount) || messageBitCount < 1) {
    throw new Error(`expected messageBitCount >= 1, got ${messageBitCount}`);
  }
  const coverBitCount = stegoBits.length;
  if (messageBitCount >= coverBitCount) {
    throw new Error(
      `expected messageBitCount < coverBitCount, got m=${messageBitCount}, n=${coverBitCount}`,
    );
  }
  const submatrixWidth = Math.ceil(coverBitCount / messageBitCount);
  const hHatColumns = generateHHatColumns(hHatSeed, constraintHeight, submatrixWidth);
  const messageBits = new Uint8Array(messageBitCount);
  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    if (stegoBits[coverIndex] === 0) {
      continue;
    }
    const columnBits = hHatColumns[coverIndex % submatrixWidth];
    const rowOffset = Math.floor(coverIndex / submatrixWidth);
    for (let rowInColumn = 0; rowInColumn < constraintHeight; rowInColumn += 1) {
      if (((columnBits >> rowInColumn) & 1) === 0) {
        continue;
      }
      const messageIndex = rowOffset + rowInColumn;
      if (messageIndex < messageBitCount) {
        messageBits[messageIndex] ^= 1;
      }
    }
  }
  return messageBits;
}

/**
 * @param {Uint8Array} coverBits
 * @param {Float64Array} costs
 * @param {Uint8Array} messageBits
 * @param {Uint32Array} hHatColumns
 * @param {number} constraintHeight
 * @param {number} submatrixWidth
 * @returns {StcEmbedResult}
 */
function viterbiEmbed(
  coverBits,
  costs,
  messageBits,
  hHatColumns,
  constraintHeight,
  submatrixWidth,
) {
  const coverBitCount = coverBits.length;
  const messageBitCount = messageBits.length;
  const stateCount = 1 << constraintHeight;
  const costCurrent = new Float64Array(stateCount);
  const costNext = new Float64Array(stateCount);
  costCurrent.fill(COST_INFINITY);
  costCurrent[0] = 0;

  // backPtrPrevState[j][state] and backPtrBit[j][state]
  const backPtrPrevState = new Uint16Array(coverBitCount * stateCount);
  const backPtrBit = new Uint8Array(coverBitCount * stateCount);

  for (let coverIndex = 0; coverIndex < coverBitCount; coverIndex += 1) {
    costNext.fill(COST_INFINITY);
    const columnBits = hHatColumns[coverIndex % submatrixWidth];
    const emitsBit = coverIndex > 0 && coverIndex % submatrixWidth === 0;
    const messageIndex = emitsBit ? coverIndex / submatrixWidth - 1 : -1;
    const coverBit = coverBits[coverIndex];
    const flipCost = costs[coverIndex];

    for (let state = 0; state < stateCount; state += 1) {
      const stateCost = costCurrent[state];
      if (stateCost === COST_INFINITY) {
        continue;
      }
      if (emitsBit) {
        if ((state & 1) !== messageBits[messageIndex]) {
          continue;
        }
      }
      const shiftedState = emitsBit ? state >>> 1 : state;

      // Keep cover bit.
      const nextKeep = coverBit === 1 ? shiftedState ^ columnBits : shiftedState;
      if (stateCost < costNext[nextKeep]) {
        costNext[nextKeep] = stateCost;
        const pointerIndex = coverIndex * stateCount + nextKeep;
        backPtrPrevState[pointerIndex] = state;
        backPtrBit[pointerIndex] = coverBit;
      }

      // Flip cover bit.
      const nextFlip = coverBit === 0 ? shiftedState ^ columnBits : shiftedState;
      const flippedCost = stateCost + flipCost;
      if (flippedCost < costNext[nextFlip]) {
        costNext[nextFlip] = flippedCost;
        const pointerIndex = coverIndex * stateCount + nextFlip;
        backPtrPrevState[pointerIndex] = state;
        backPtrBit[pointerIndex] = coverBit ^ 1;
      }
    }

    costCurrent.set(costNext);
  }

  // Emits occur at j = w, 2w, ... while j < n → count = floor((n-1)/w).
  // When n is a multiple of w, floor(n/w) is one too large (off-by-one vs Phasm guide).
  const emittedDuringForward = coverBitCount > 0
    ? Math.floor((coverBitCount - 1) / submatrixWidth)
    : 0;
  const remainingStart = emittedDuringForward;
  let bestState = -1;
  let bestCost = COST_INFINITY;
  for (let state = 0; state < stateCount; state += 1) {
    if (costCurrent[state] === COST_INFINITY) {
      continue;
    }
    if (!terminalStateMatchesRemaining(state, messageBits, remainingStart, constraintHeight)) {
      continue;
    }
    if (costCurrent[state] < bestCost) {
      bestCost = costCurrent[state];
      bestState = state;
    }
  }
  if (bestState < 0) {
    throw new Error(
      `STC embedding failed: no terminal state for m=${messageBitCount}, n=${coverBitCount}, w=${submatrixWidth}`,
    );
  }

  const stegoBits = new Uint8Array(coverBitCount);
  let state = bestState;
  let changedCount = 0;
  for (let coverIndex = coverBitCount - 1; coverIndex >= 0; coverIndex -= 1) {
    const pointerIndex = coverIndex * stateCount + state;
    const stegoBit = backPtrBit[pointerIndex];
    stegoBits[coverIndex] = stegoBit;
    if (stegoBit !== coverBits[coverIndex]) {
      changedCount += 1;
    }
    state = backPtrPrevState[pointerIndex];
  }

  return {
    stegoBits,
    totalDistortion: bestCost,
    changedCount,
  };
}

/**
 * Remaining message bits after forward emissions must match the low bits of the terminal state.
 *
 * @param {number} state
 * @param {Uint8Array} messageBits
 * @param {number} remainingStart
 * @param {number} constraintHeight
 * @returns {boolean}
 */
function terminalStateMatchesRemaining(state, messageBits, remainingStart, constraintHeight) {
  const remainingCount = messageBits.length - remainingStart;
  if (remainingCount <= 0) {
    return true;
  }
  if (remainingCount > constraintHeight) {
    return false;
  }
  for (let offset = 0; offset < remainingCount; offset += 1) {
    const expectedBit = messageBits[remainingStart + offset];
    const stateBit = (state >> offset) & 1;
    if (stateBit !== expectedBit) {
      return false;
    }
  }
  return true;
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
    const bitValue = bits[index];
    if (bitValue !== 0 && bitValue !== 1) {
      throw new Error(`expected ${name}[${index}] in {0,1}, got ${bitValue}`);
    }
  }
}

/**
 * @param {number} constraintHeight
 * @returns {void}
 */
function assertHeight(constraintHeight) {
  if (!Number.isInteger(constraintHeight) || constraintHeight < 1 || constraintHeight > 16) {
    throw new Error(`expected constraintHeight in 1..16, got ${constraintHeight}`);
  }
}
