/**
 * Mild JPEG block-grid reset before steganography.
 *
 * Formal name: JPEG block-grid reset.
 * Informal synonym (glossary): шакализация.
 *
 * Several randomized micro-crops (non-multiples of 8) plus high-quality JPEG
 * round-trips shift the 8×8 DCT block lattice without heavy visual damage.
 */

/**
 * @typedef {object} JpegBlockGridResetStats
 * @property {number} iterationCount
 * @property {number} finalJpegQuality
 * @property {number} sourceWidth
 * @property {number} sourceHeight
 */

const MIN_ITERATION_COUNT = 2;
const MAX_ITERATION_COUNT = 4;
const MIN_ALIGNMENT_SHIFT_PX = 1;
const MAX_ALIGNMENT_SHIFT_PX = 7;
const MIN_TRAILING_CROP_PX = 0;
const MAX_TRAILING_CROP_PX = 2;
const MIN_JPEG_QUALITY = 0.9;
const MAX_JPEG_QUALITY = 0.94;

/**
 * Sample a uniform integer in the inclusive range [minimumValue, maximumValue].
 *
 * side-effects: consumes CSPRNG entropy
 *
 * @param {number} minimumValue
 * @param {number} maximumValue
 * @returns {number}
 */
function sampleInclusiveInt(minimumValue, maximumValue) {
  if (!Number.isSafeInteger(minimumValue) || !Number.isSafeInteger(maximumValue)) {
    throw new TypeError(
      `expected safe integer bounds, got [${minimumValue}, ${maximumValue}]`,
    );
  }
  if (maximumValue < minimumValue) {
    throw new RangeError(
      `expected maximumValue >= minimumValue, got [${minimumValue}, ${maximumValue}]`,
    );
  }
  const span = maximumValue - minimumValue + 1;
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  return minimumValue + (randomBytes[0] % span);
}

/**
 * Sample a uniform float in [minimumValue, maximumValue).
 *
 * side-effects: consumes CSPRNG entropy
 *
 * @param {number} minimumValue
 * @param {number} maximumValue
 * @returns {number}
 */
function sampleUnitInterval(minimumValue, maximumValue) {
  if (!(Number.isFinite(minimumValue) && Number.isFinite(maximumValue))) {
    throw new TypeError(
      `expected finite float bounds, got [${minimumValue}, ${maximumValue}]`,
    );
  }
  if (maximumValue <= minimumValue) {
    throw new RangeError(
      `expected maximumValue > minimumValue, got [${minimumValue}, ${maximumValue}]`,
    );
  }
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const unitSample = randomBytes[0] / 0x1_0000_0000;
  return minimumValue + (maximumValue - minimumValue) * unitSample;
}

/**
 * Encode a canvas as a JPEG blob at the given quality.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} jpegQuality
 * @returns {Promise<Blob>}
 */
function canvasToJpegBlob(canvas, jpegQuality) {
  if (!(jpegQuality >= 0 && jpegQuality <= 1)) {
    throw new RangeError(`expected jpegQuality in [0, 1], got ${jpegQuality}`);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("JPEG encode failed during block-grid reset"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", jpegQuality);
  });
}

/**
 * Decode JPEG bytes onto a canvas of the requested output size.
 *
 * side-effects: creates temporary ImageBitmap
 *
 * @param {Blob} jpegBlob
 * @param {number} outputWidth
 * @param {number} outputHeight
 * @returns {Promise<HTMLCanvasElement>}
 */
async function jpegBlobToSizedCanvas(jpegBlob, outputWidth, outputHeight) {
  if (!Number.isSafeInteger(outputWidth) || outputWidth <= 0) {
    throw new TypeError(`expected positive outputWidth, got ${outputWidth}`);
  }
  if (!Number.isSafeInteger(outputHeight) || outputHeight <= 0) {
    throw new TypeError(`expected positive outputHeight, got ${outputHeight}`);
  }
  const imageBitmap = await createImageBitmap(jpegBlob);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    imageBitmap.close();
    throw new Error("2d context unavailable for JPEG block-grid reset");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(imageBitmap, 0, 0, outputWidth, outputHeight);
  imageBitmap.close();
  return canvas;
}

/**
 * One mild crop that shifts content relative to the 8×8 JPEG lattice, then
 * scales back to the original canvas size.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {HTMLCanvasElement}
 */
function cropWithBlockGridShift(sourceCanvas) {
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  if (sourceWidth < 32 || sourceHeight < 32) {
    throw new RangeError(
      `expected cover at least 32×32 for JPEG block-grid reset, got ${sourceWidth}×${sourceHeight}`,
    );
  }
  const cropLeft = sampleInclusiveInt(MIN_ALIGNMENT_SHIFT_PX, MAX_ALIGNMENT_SHIFT_PX);
  const cropTop = sampleInclusiveInt(MIN_ALIGNMENT_SHIFT_PX, MAX_ALIGNMENT_SHIFT_PX);
  const cropRight = sampleInclusiveInt(MIN_TRAILING_CROP_PX, MAX_TRAILING_CROP_PX);
  const cropBottom = sampleInclusiveInt(MIN_TRAILING_CROP_PX, MAX_TRAILING_CROP_PX);
  const croppedWidth = sourceWidth - cropLeft - cropRight;
  const croppedHeight = sourceHeight - cropTop - cropBottom;
  if (croppedWidth < 16 || croppedHeight < 16) {
    throw new RangeError(
      `expected cropped region at least 16×16, got ${croppedWidth}×${croppedHeight} `
        + `from ${sourceWidth}×${sourceHeight}`,
    );
  }
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = sourceWidth;
  croppedCanvas.height = sourceHeight;
  const context = croppedCanvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new Error("2d context unavailable for JPEG block-grid crop");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceCanvas,
    cropLeft,
    cropTop,
    croppedWidth,
    croppedHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  return croppedCanvas;
}

/**
 * Apply a mild randomized JPEG block-grid reset to a cover canvas.
 *
 * side-effects: consumes CSPRNG entropy; creates temporary canvases/bitmaps
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {Promise<{
 *   canvas: HTMLCanvasElement,
 *   jpegBytes: Uint8Array,
 *   stats: JpegBlockGridResetStats
 * }>}
 */
export async function resetJpegBlockGrid(sourceCanvas) {
  if (!(sourceCanvas instanceof HTMLCanvasElement)) {
    throw new TypeError(
      `expected HTMLCanvasElement sourceCanvas, got ${Object.prototype.toString.call(sourceCanvas)}`,
    );
  }
  if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
    throw new RangeError(
      `expected non-empty source canvas, got ${sourceCanvas.width}×${sourceCanvas.height}`,
    );
  }
  const iterationCount = sampleInclusiveInt(MIN_ITERATION_COUNT, MAX_ITERATION_COUNT);
  let workingCanvas = sourceCanvas;
  /** @type {Blob | null} */
  let lastJpegBlob = null;
  let lastJpegQuality = MIN_JPEG_QUALITY;
  for (let iterationIndex = 0; iterationIndex < iterationCount; iterationIndex += 1) {
    // Loop invariant: workingCanvas matches the original cover dimensions.
    const shiftedCanvas = cropWithBlockGridShift(workingCanvas);
    lastJpegQuality = sampleUnitInterval(MIN_JPEG_QUALITY, MAX_JPEG_QUALITY);
    lastJpegBlob = await canvasToJpegBlob(shiftedCanvas, lastJpegQuality);
    workingCanvas = await jpegBlobToSizedCanvas(
      lastJpegBlob,
      sourceCanvas.width,
      sourceCanvas.height,
    );
  }
  if (lastJpegBlob === null) {
    throw new Error("expected at least one JPEG round-trip during block-grid reset");
  }
  const jpegBytes = new Uint8Array(await lastJpegBlob.arrayBuffer());
  return {
    canvas: workingCanvas,
    jpegBytes,
    stats: {
      iterationCount,
      finalJpegQuality: lastJpegQuality,
      sourceWidth: sourceCanvas.width,
      sourceHeight: sourceCanvas.height,
    },
  };
}

export const JPEG_BLOCK_GRID_RESET_GLOSSARY = Object.freeze({
  formalName: "JPEG block-grid reset",
  formalNameRu: "сброс сетки блоков JPEG",
  informalAliasRu: "шакализация",
  summary:
    "A few mild randomized crops that break 8×8 JPEG block alignment, each followed by a high-quality JPEG round-trip, applied before stego embedding.",
});
