/** Deterministic SHAKE-256 byte stream for H-hat and cover permutation. */

import { shake256 } from "@noble/hashes/sha3.js";

/**
 * Expand a seed into a long deterministic byte stream.
 *
 * @param {Uint8Array} seedBytes shape (seedLength,)
 * @param {number} outputByteCount
 * @returns {Uint8Array} shape (outputByteCount,)
 */
export function shakeExpand(seedBytes, outputByteCount) {
  assert(seedBytes instanceof Uint8Array, "seedBytes", "Uint8Array", seedBytes);
  assert(
    Number.isInteger(outputByteCount) && outputByteCount >= 0,
    "outputByteCount",
    "non-negative integer",
    outputByteCount,
  );
  if (outputByteCount === 0) {
    return new Uint8Array(0);
  }
  return shake256(seedBytes, { dkLen: outputByteCount });
}

/**
 * Fisher–Yates permutation of 0..length-1 from a deterministic byte stream.
 *
 * @param {number} length
 * @param {Uint8Array} seedBytes shape (seedLength,)
 * @returns {Uint32Array} shape (length,)
 */
export function fisherYatesPermutation(length, seedBytes) {
  assert(Number.isInteger(length) && length >= 0, "length", "non-negative integer", length);
  const permutation = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    permutation[index] = index;
  }
  if (length <= 1) {
    return permutation;
  }
  // 4 bytes per swap step is enough for lengths up to ~2^32.
  const randomBytes = shakeExpand(seedBytes, length * 4);
  const randomView = new DataView(randomBytes.buffer, randomBytes.byteOffset, randomBytes.byteLength);
  for (let index = length - 1; index >= 1; index -= 1) {
    const randomWord = randomView.getUint32(index * 4, false);
    const swapIndex = randomWord % (index + 1);
    const temporary = permutation[index];
    permutation[index] = permutation[swapIndex];
    permutation[swapIndex] = temporary;
  }
  return permutation;
}

/**
 * @param {boolean} condition
 * @param {string} name
 * @param {string} expected
 * @param {unknown} got
 * @returns {asserts condition}
 */
function assert(condition, name, expected, got) {
  if (!condition) {
    throw new Error(`expected ${name} to be ${expected}, got ${String(got)}`);
  }
}
