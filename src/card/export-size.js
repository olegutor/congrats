/** Postcard PNG export size presets (resolution controls file size and stego capacity). */

/**
 * @typedef {object} ExportSizePreset
 * @property {string} id
 * @property {number} width
 * @property {number} height
 * @property {string} labelKey
 */

/** @type {Readonly<Record<string, ExportSizePreset>>} */
export const EXPORT_SIZE_PRESETS = Object.freeze({
  compact: Object.freeze({
    id: "compact",
    width: 384,
    height: 480,
    labelKey: "exportSizeCompact",
  }),
  medium: Object.freeze({
    id: "medium",
    width: 540,
    height: 675,
    labelKey: "exportSizeMedium",
  }),
  full: Object.freeze({
    id: "full",
    width: 1080,
    height: 1350,
    labelKey: "exportSizeFull",
  }),
});

/** @type {ReadonlyArray<string>} */
export const EXPORT_SIZE_PRESET_IDS = Object.freeze(Object.keys(EXPORT_SIZE_PRESETS));

export const DEFAULT_EXPORT_SIZE_ID = "medium";

/**
 * @param {string} presetId
 * @returns {ExportSizePreset}
 */
export function getExportSizePreset(presetId) {
  const preset = EXPORT_SIZE_PRESETS[presetId];
  assert(
    preset !== undefined,
    `expected export size id in [${EXPORT_SIZE_PRESET_IDS.join(", ")}], got ${presetId}`,
  );
  return preset;
}

/**
 * Scale a source canvas into a new canvas of the given size.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function scaleCanvasToSize(sourceCanvas, width, height) {
  assert(width > 0 && height > 0, `expected positive size, got ${width}×${height}`);
  assert(sourceCanvas.width > 0 && sourceCanvas.height > 0, "source canvas is empty");
  const scaledCanvas = document.createElement("canvas");
  scaledCanvas.width = width;
  scaledCanvas.height = height;
  const context = scaledCanvas.getContext("2d", { willReadFrequently: true });
  assert(context !== null, "2d context unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return scaledCanvas;
}

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
