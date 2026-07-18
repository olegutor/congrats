import { pickRandomWish } from './wishes.js';
import {
  getPaletteForCategory,
  pickRandomLayout,
  pickRandomFontStyle,
} from './themes.js';

/**
 * Общие константы и утилиты для всех версий рендера открыток.
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** @type {Readonly<{v1: 'v1', v2: 'v2', v3: 'v3', v4: 'v4'}>} */
export const CARD_RENDERER_VERSIONS = Object.freeze({
  v1: 'v1',
  v2: 'v2',
  v3: 'v3',
  v4: 'v4',
});

/** @type {ReadonlyArray<'v1' | 'v2' | 'v3' | 'v4'>} */
export const CARD_RENDERER_VERSION_LIST = Object.freeze(['v1', 'v2', 'v3', 'v4']);

/** @type {CanvasRenderingContext2D | null} */
let g_renderContext = null;

/** @type {HTMLCanvasElement | null} */
let g_renderCanvas = null;

/**
 * Создаёт или возвращает offscreen canvas для рендера.
 * @returns {HTMLCanvasElement}
 */
export function getRenderCanvas() {
  if (g_renderCanvas === null) {
    g_renderCanvas = document.createElement('canvas');
    g_renderCanvas.width = CARD_WIDTH;
    g_renderCanvas.height = CARD_HEIGHT;
    g_renderContext = g_renderCanvas.getContext('2d');
    assert(g_renderContext !== null, 'Canvas 2D context unavailable');
  }
  return g_renderCanvas;
}

/**
 * @returns {CanvasRenderingContext2D}
 */
export function getRenderContext() {
  getRenderCanvas();
  assert(g_renderContext !== null, 'Render context is null after getRenderCanvas');
  return g_renderContext;
}

/**
 * Простая проверка условия с сообщением об ошибке.
 * @param {boolean} condition
 * @param {string} message
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Псевдослучайное число в диапазоне [min, max).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Случайное целое в диапазоне [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

/**
 * Парсит цвет (#RRGGBB или rgb(r,g,b)) в RGB-компоненты.
 * @param {string} colorValue
 * @returns {[number, number, number]}
 */
export function parseColor(colorValue) {
  if (colorValue.startsWith('#')) {
    assert(colorValue.length === 7, `Expected #RRGGBB, got ${colorValue}`);
    const red = parseInt(colorValue.slice(1, 3), 16);
    const green = parseInt(colorValue.slice(3, 5), 16);
    const blue = parseInt(colorValue.slice(5, 7), 16);
    return [red, green, blue];
  }
  const rgbMatch = colorValue.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  assert(rgbMatch !== null, `Expected #RRGGBB or rgb(r,g,b), got ${colorValue}`);
  return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
}

/**
 * Смешивает два цвета (#RRGGBB или rgb).
 * @param {string} colorA
 * @param {string} colorB
 * @param {number} ratio — 0..1
 * @returns {string}
 */
export function blendColors(colorA, colorB, ratio) {
  const [redA, greenA, blueA] = parseColor(colorA);
  const [redB, greenB, blueB] = parseColor(colorB);
  const red = Math.round(redA + (redB - redA) * ratio);
  const green = Math.round(greenA + (greenB - greenA) * ratio);
  const blue = Math.round(blueA + (blueB - blueA) * ratio);
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Преобразует цвет (#RRGGBB или rgb) в rgba(..., alpha).
 * @param {string} colorValue
 * @param {number} alpha
 * @returns {string}
 */
export function rgbToRgba(colorValue, alpha) {
  const [red, green, blue] = parseColor(colorValue);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Ограничивает значение канала 0..255.
 * @param {number} value
 * @returns {number}
 */
export function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Разбивает текст на строки по ширине.
 * @param {CanvasRenderingContext2D} context
 * @param {string} textBlock
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapTextLines(context, textBlock, maxWidth) {
  const manualLines = textBlock.split('\n');
  const wrappedLines = [];
  for (const manualLine of manualLines) {
    const words = manualLine.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === '')) {
      wrappedLines.push('');
      continue;
    }
    let currentLine = words[0];
    for (let wordIndex = 1; wordIndex < words.length; wordIndex++) {
      const candidateLine = `${currentLine} ${words[wordIndex]}`;
      if (context.measureText(candidateLine).width <= maxWidth) {
        currentLine = candidateLine;
      } else {
        wrappedLines.push(currentLine);
        currentLine = words[wordIndex];
      }
    }
    wrappedLines.push(currentLine);
  }
  return wrappedLines;
}

/**
 * Возвращает CSS font string для основного текста.
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {number} fontSize
 * @returns {string}
 */
export function getMainFont(fontStyle, fontSize) {
  if (fontStyle === 'script') {
    return `${fontSize}px "Caveat", cursive`;
  }
  return `${fontSize}px "Playfair Display", Georgia, serif`;
}

/** @type {ReadonlyArray<string>} */
export const SIGNATURE_OPTIONS = Object.freeze([
  'С теплом и радостью',
  'От всего сердца',
  'С наилучшими пожеланиями',
  'Обнимаю крепко!',
  'С любовью и нежностью',
  'Искренне ваш друг',
  'С улыбкой и теплом',
  'Желаю счастья!',
]);

/** @type {ReadonlyArray<string>} */
export const SIGNATURE_OPTIONS_EN = Object.freeze([
  'With warmth and joy',
  'From the heart',
  'Best wishes',
  'Big hug!',
  'With love and care',
  'Yours truly',
  'With a smile',
  'Wishing you happiness!',
]);

/**
 * Случайная подпись для открытки.
 * @param {'ru' | 'en'} [language]
 * @returns {string}
 */
export function pickRandomSignature(language = 'ru') {
  assert(language === 'ru' || language === 'en', `expected ru|en, got ${language}`);
  const signaturePool = language === 'en' ? SIGNATURE_OPTIONS_EN : SIGNATURE_OPTIONS;
  const index = randomInt(0, signaturePool.length - 1);
  return signaturePool[index];
}

/**
 * Подбирает размер шрифта и строки для текста пожелания.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @returns {{lines: string[], fontSize: number, lineHeight: number, startY: number}}
 */
export function layoutWishTextBlock(context, wishText, fontStyle, layout) {
  const horizontalPadding = layout === 'minimal' ? 100 : 120;
  const maxTextWidth = CARD_WIDTH - horizontalPadding * 2;
  let fontSize = fontStyle === 'script' ? 124 : 96;
  if (wishText.length > 80) {
    fontSize -= 12;
  }
  if (wishText.length > 120) {
    fontSize -= 12;
  }

  let lines = [];
  let lineHeight = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    context.font = getMainFont(fontStyle, fontSize);
    lines = wrapTextLines(context, wishText, maxTextWidth);
    lineHeight = fontSize * (fontStyle === 'script' ? 1.15 : 1.35);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= CARD_HEIGHT * 0.62) {
      break;
    }
    fontSize -= 6;
  }

  const textBlockHeight = lines.length * lineHeight;
  let startY = CARD_HEIGHT / 2 - textBlockHeight / 2 + lineHeight / 2;
  if (layout === 'ribbon') {
    startY += 40;
  }

  return { lines, fontSize, lineHeight, startY };
}

/**
 * Создаёт случайное состояние открытки (текст, оформление).
 * @param {'v1' | 'v2' | 'v3' | 'v4'} rendererVersion
 * @param {'ru' | 'en'} [language]
 * @returns {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4', postProcessSeed: number}}
 */
export function createRandomCardState(rendererVersion, language = 'ru') {
  const version = rendererVersion ?? CARD_RENDERER_VERSIONS.v4;
  assert(
    CARD_RENDERER_VERSION_LIST.includes(version),
    `Unknown renderer version: ${version}, expected one of ${CARD_RENDERER_VERSION_LIST.join(', ')}`,
  );
  assert(language === 'ru' || language === 'en', `expected ru|en, got ${language}`);
  const wish = pickRandomWish(language);
  return {
    text: wish.text,
    category: wish.category,
    signature: pickRandomSignature(language),
    layout: pickRandomLayout(),
    fontStyle: pickRandomFontStyle(),
    rendererVersion: version,
    postProcessSeed: randomRange(0, 10000),
  };
}

/** @type {HTMLCanvasElement | null} */
let g_flattenCanvas = null;

/**
 * Накладывает canvas на непрозрачный фон — убирает альфа-канал.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} backgroundColor — #RRGGBB или rgb(...)
 * @returns {HTMLCanvasElement}
 */
export function flattenCanvasToOpaque(sourceCanvas, backgroundColor) {
  if (g_flattenCanvas === null) {
    g_flattenCanvas = document.createElement('canvas');
  }
  if (sourceCanvas === g_flattenCanvas) {
    return g_flattenCanvas;
  }
  g_flattenCanvas.width = sourceCanvas.width;
  g_flattenCanvas.height = sourceCanvas.height;
  const flatContext = g_flattenCanvas.getContext('2d');
  assert(flatContext !== null, 'Flatten context unavailable');
  flatContext.fillStyle = backgroundColor;
  flatContext.fillRect(0, 0, g_flattenCanvas.width, g_flattenCanvas.height);
  flatContext.drawImage(sourceCanvas, 0, 0);
  return g_flattenCanvas;
}

/**
 * Заливает canvas непрозрачным цветом перед рисованием.
 * @param {CanvasRenderingContext2D} context
 * @param {string} backgroundColor
 */
export function fillOpaqueCanvasBase(context, backgroundColor) {
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Экспортирует canvas в PNG Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {string} backgroundColor
 * @returns {Promise<Blob>}
 */
export function exportCanvasToPngBlob(canvas, backgroundColor) {
  const opaqueCanvas = flattenCanvasToOpaque(canvas, backgroundColor);
  return exportCanvasToImageBlob(opaqueCanvas, 'image/png', 1.0);
}

/**
 * Экспортирует canvas в JPEG Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality — 0..1
 * @param {string} backgroundColor
 * @returns {Promise<Blob>}
 */
export function exportCanvasToJpegBlob(canvas, quality, backgroundColor) {
  assert(quality > 0 && quality <= 1, `Expected quality in (0, 1], got ${quality}`);
  const opaqueCanvas = flattenCanvasToOpaque(canvas, backgroundColor);
  return exportCanvasToImageBlob(opaqueCanvas, 'image/jpeg', quality);
}

/**
 * Экспортирует canvas в Blob заданного формата.
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType
 * @param {number} quality — 0..1, для PNG игнорируется
 * @returns {Promise<Blob>}
 */
export function exportCanvasToImageBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error(`Failed to export ${mimeType}`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Build a filesystem-safe stem from wish / greeting text.
 * @param {string} wishText
 * @returns {string}
 */
export function wishTextToFilenameStem(wishText) {
  assert(typeof wishText === 'string', `expected string wishText, got ${typeof wishText}`);
  const firstLine = wishText.split('\n')[0].trim();
  const cleanedStem = firstLine
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return cleanedStem || 'congrats';
}

/**
 * Формирует имя файла для скачивания по тексту пожелания.
 * @param {string} wishText
 * @param {'png' | 'jpeg'} imageFormat
 * @returns {string}
 */
export function buildDownloadFilename(wishText, imageFormat) {
  assert(imageFormat === 'png' || imageFormat === 'jpeg', `expected png|jpeg, got ${imageFormat}`);
  const fileExtension = imageFormat === 'jpeg' ? 'jpg' : 'png';
  return `${wishTextToFilenameStem(wishText)}.${fileExtension}`;
}
