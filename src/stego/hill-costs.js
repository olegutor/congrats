/**
 * HILL spatial distortion costs (Li, Cheng, Huang 2014 style).
 * High-pass residual → absolute → dual low-pass → inverse cost.
 */

/** Small stabilizer in the denominator. */
const HILL_SIGMA = 1.0;

/** Exponent on the smoothed residual magnitude. */
const HILL_GAMMA = 1.0;

/**
 * 3×3 high-pass kernel (center-weighted residual).
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const HIGH_PASS_KERNEL = Object.freeze([
  Object.freeze([-1, 2, -1]),
  Object.freeze([2, -4, 2]),
  Object.freeze([-1, 2, -1]),
]);

/**
 * 3×3 averaging low-pass kernel.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const LOW_PASS_KERNEL = Object.freeze([
  Object.freeze([1 / 9, 1 / 9, 1 / 9]),
  Object.freeze([1 / 9, 1 / 9, 1 / 9]),
  Object.freeze([1 / 9, 1 / 9, 1 / 9]),
]);

/**
 * Build a grayscale luminance plane from RGBA ImageData.
 *
 * @param {ImageData} imageData shape width×height×4
 * @returns {Float64Array} shape (width * height,)
 */
export function rgbaToLuminance(imageData) {
  const { width, height, data } = imageData;
  assertPositiveSize(width, height);
  const luminance = new Float64Array(width * height);
  let pixelIndex = 0;
  for (let byteOffset = 0; byteOffset < data.length; byteOffset += 4) {
    const red = data[byteOffset];
    const green = data[byteOffset + 1];
    const blue = data[byteOffset + 2];
    luminance[pixelIndex] = 0.299 * red + 0.587 * green + 0.114 * blue;
    pixelIndex += 1;
  }
  return luminance;
}

/**
 * Compute HILL embedding costs for every pixel (lower = prefer change).
 *
 * @param {ImageData} imageData shape width×height×4
 * @returns {Float64Array} shape (width * height,)
 */
export function computeHillCosts(imageData) {
  const { width, height } = imageData;
  assertPositiveSize(width, height);
  const luminance = rgbaToLuminance(imageData);
  const highPass = convolve2d(luminance, width, height, HIGH_PASS_KERNEL);
  const absoluteResidual = new Float64Array(highPass.length);
  for (let index = 0; index < highPass.length; index += 1) {
    absoluteResidual[index] = Math.abs(highPass[index]);
  }
  const lowPassOne = convolve2d(absoluteResidual, width, height, LOW_PASS_KERNEL);
  const lowPassTwo = convolve2d(lowPassOne, width, height, LOW_PASS_KERNEL);
  const costs = new Float64Array(width * height);
  for (let index = 0; index < costs.length; index += 1) {
    const denominator = (lowPassTwo[index] + HILL_SIGMA) ** HILL_GAMMA;
    costs[index] = 1 / denominator;
  }
  return costs;
}

/**
 * Valid-pixel (clamp) 2D convolution.
 *
 * @param {Float64Array} source shape (width * height,)
 * @param {number} width
 * @param {number} height
 * @param {ReadonlyArray<ReadonlyArray<number>>} kernel
 * @returns {Float64Array} shape (width * height,)
 */
function convolve2d(source, width, height, kernel) {
  const kernelHeight = kernel.length;
  const kernelWidth = kernel[0].length;
  const radiusY = Math.floor(kernelHeight / 2);
  const radiusX = Math.floor(kernelWidth / 2);
  const output = new Float64Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      let accumulator = 0;
      for (let kernelRow = 0; kernelRow < kernelHeight; kernelRow += 1) {
        const sampleRow = clampIndex(row + kernelRow - radiusY, height);
        for (let kernelColumn = 0; kernelColumn < kernelWidth; kernelColumn += 1) {
          const sampleColumn = clampIndex(column + kernelColumn - radiusX, width);
          const sourceIndex = sampleRow * width + sampleColumn;
          accumulator += source[sourceIndex] * kernel[kernelRow][kernelColumn];
        }
      }
      output[row * width + column] = accumulator;
    }
  }
  return output;
}

/**
 * @param {number} index
 * @param {number} size
 * @returns {number}
 */
function clampIndex(index, size) {
  if (index < 0) {
    return 0;
  }
  if (index >= size) {
    return size - 1;
  }
  return index;
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {void}
 */
function assertPositiveSize(width, height) {
  if (!Number.isInteger(width) || width < 1) {
    throw new Error(`expected width >= 1 integer, got ${width}`);
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new Error(`expected height >= 1 integer, got ${height}`);
  }
}
