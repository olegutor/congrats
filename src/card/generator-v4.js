import {
  CARD_HEIGHT,
  CARD_RENDERER_VERSIONS,
  CARD_WIDTH,
  assert,
  blendColors,
  createEntropySeed,
  createRandomCardState,
  createSeededRandom,
  fillOpaqueCanvasBase,
  flattenCanvasToOpaque,
  getMainFont,
  getRenderCanvas,
  getRenderContext,
  rgbToRgba,
  seededRange,
  wrapTextLines,
} from './generator-shared.js';
import { getPaletteForCategory } from './themes.js';

/**
 * Рендер открыток v4 — «Живая вселенная»:
 * полярное сияние, звёздная пыль, орбиты и полупрозрачная типографическая капсула.
 */

const V4_BACKGROUND_COLOR = '#090B1A';
const V4_PANEL_COLOR = '#10152B';
const V4_TEXT_COLOR = '#FFFDF7';

/**
 * Строит скруглённый прямоугольник.
 * @param {CanvasRenderingContext2D} context
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @returns {void}
 */
function traceRoundedRectangle(context, left, top, width, height, radius) {
  assert(width > 0 && height > 0, `Expected positive rectangle, got ${width}x${height}`);
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(left + safeRadius, top);
  context.lineTo(left + width - safeRadius, top);
  context.quadraticCurveTo(left + width, top, left + width, top + safeRadius);
  context.lineTo(left + width, top + height - safeRadius);
  context.quadraticCurveTo(left + width, top + height, left + width - safeRadius, top + height);
  context.lineTo(left + safeRadius, top + height);
  context.quadraticCurveTo(left, top + height, left, top + height - safeRadius);
  context.lineTo(left, top + safeRadius);
  context.quadraticCurveTo(left, top, left + safeRadius, top);
  context.closePath();
}

/**
 * Создаёт контрастную неоновую палитру из категории пожелания.
 * @param {{background: string[], accent: string, text: string, textShadow: string, decor: string}} sourcePalette
 * @returns {{primary: string, secondary: string, tertiary: string, dark: string, panel: string, text: string}}
 */
function createCosmicPaletteV4(sourcePalette) {
  return {
    primary: blendColors(sourcePalette.accent, '#FF4FD8', 0.38),
    secondary: blendColors(sourcePalette.decor, '#4DEEFF', 0.58),
    tertiary: blendColors(sourcePalette.background[2], '#8C6CFF', 0.72),
    dark: blendColors(V4_BACKGROUND_COLOR, sourcePalette.text, 0.08),
    panel: blendColors(V4_PANEL_COLOR, sourcePalette.accent, 0.08),
    text: V4_TEXT_COLOR,
  };
}

/**
 * Рисует глубокий многослойный фон.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, tertiary: string, dark: string}} palette
 * @returns {void}
 */
function drawCosmicBackgroundV4(context, palette) {
  const baseGradient = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  baseGradient.addColorStop(0, palette.dark);
  baseGradient.addColorStop(0.48, blendColors(palette.dark, '#191339', 0.5));
  baseGradient.addColorStop(1, '#050711');
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const upperGlow = context.createRadialGradient(160, 100, 0, 160, 100, 720);
  upperGlow.addColorStop(0, rgbToRgba(palette.primary, 0.3));
  upperGlow.addColorStop(0.45, rgbToRgba(palette.tertiary, 0.11));
  upperGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = upperGlow;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const lowerGlow = context.createRadialGradient(CARD_WIDTH, CARD_HEIGHT, 0, CARD_WIDTH, CARD_HEIGHT, 760);
  lowerGlow.addColorStop(0, rgbToRgba(palette.secondary, 0.2));
  lowerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = lowerGlow;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Рисует ленты полярного сияния.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, tertiary: string}} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawAuroraV4(context, palette, seededRandom) {
  const auroraColors = [palette.primary, palette.secondary, palette.tertiary];
  context.save();
  context.globalCompositeOperation = 'screen';
  context.lineCap = 'round';

  for (let ribbonIndex = 0; ribbonIndex < 7; ribbonIndex++) {
    const startY = seededRange(seededRandom, 80, CARD_HEIGHT - 120);
    const controlOffset = seededRange(seededRandom, -250, 250);
    const endY = startY + seededRange(seededRandom, -190, 190);
    const ribbonColor = auroraColors[ribbonIndex % auroraColors.length];

    for (let glowLayerIndex = 4; glowLayerIndex >= 0; glowLayerIndex--) {
      context.strokeStyle = rgbToRgba(ribbonColor, 0.025 + glowLayerIndex * 0.012);
      context.lineWidth = 32 + glowLayerIndex * 22;
      context.beginPath();
      context.moveTo(-120, startY);
      context.bezierCurveTo(
        CARD_WIDTH * 0.24,
        startY + controlOffset,
        CARD_WIDTH * 0.72,
        endY - controlOffset,
        CARD_WIDTH + 120,
        endY,
      );
      context.stroke();
    }
  }
  context.restore();
}

/**
 * Рисует звёздную пыль и крупные светила.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, text: string}} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawStarFieldV4(context, palette, seededRandom) {
  context.save();
  for (let starIndex = 0; starIndex < 150; starIndex++) {
    const starX = seededRange(seededRandom, 28, CARD_WIDTH - 28);
    const starY = seededRange(seededRandom, 24, CARD_HEIGHT - 24);
    const starRadius = seededRange(seededRandom, 0.45, 2.1);
    const starAlpha = seededRange(seededRandom, 0.18, 0.88);
    context.fillStyle = rgbToRgba(starIndex % 5 === 0 ? palette.secondary : palette.text, starAlpha);
    context.beginPath();
    context.arc(starX, starY, starRadius, 0, Math.PI * 2);
    context.fill();
  }

  for (let flareIndex = 0; flareIndex < 9; flareIndex++) {
    const flareX = seededRange(seededRandom, 70, CARD_WIDTH - 70);
    const flareY = seededRange(seededRandom, 70, CARD_HEIGHT - 70);
    const flareSize = seededRange(seededRandom, 6, 16);
    context.strokeStyle = rgbToRgba(flareIndex % 2 === 0 ? palette.primary : palette.secondary, 0.62);
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(flareX - flareSize, flareY);
    context.lineTo(flareX + flareSize, flareY);
    context.moveTo(flareX, flareY - flareSize);
    context.lineTo(flareX, flareY + flareSize);
    context.stroke();
  }
  context.restore();
}

/**
 * Рисует тонкие орбитальные траектории.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, tertiary: string}} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawOrbitalSystemV4(context, palette, seededRandom) {
  context.save();
  context.translate(CARD_WIDTH / 2, CARD_HEIGHT / 2);
  context.rotate(seededRange(seededRandom, -0.38, 0.38));
  const orbitColors = [palette.primary, palette.secondary, palette.tertiary];

  for (let orbitIndex = 0; orbitIndex < 4; orbitIndex++) {
    const orbitRadiusX = 390 + orbitIndex * 58;
    const orbitRadiusY = 490 + orbitIndex * 62;
    context.strokeStyle = rgbToRgba(orbitColors[orbitIndex % orbitColors.length], 0.14);
    context.lineWidth = orbitIndex === 0 ? 2 : 1;
    context.setLineDash([8 + orbitIndex * 3, 18 + orbitIndex * 5]);
    context.beginPath();
    context.ellipse(0, 0, orbitRadiusX, orbitRadiusY, orbitIndex * 0.1, 0, Math.PI * 2);
    context.stroke();

    const satelliteAngle = seededRange(seededRandom, 0, Math.PI * 2);
    const satelliteX = Math.cos(satelliteAngle) * orbitRadiusX;
    const satelliteY = Math.sin(satelliteAngle) * orbitRadiusY;
    context.setLineDash([]);
    context.fillStyle = orbitColors[orbitIndex % orbitColors.length];
    context.shadowColor = context.fillStyle;
    context.shadowBlur = 18;
    context.beginPath();
    context.arc(satelliteX, satelliteY, 4 + orbitIndex, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/**
 * Рисует абстрактные листья-созвездия для botanical-варианта.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string}} palette
 * @param {number} originX
 * @param {number} originY
 * @param {number} direction
 * @returns {void}
 */
function drawConstellationBranchV4(context, palette, originX, originY, direction) {
  context.save();
  context.translate(originX, originY);
  context.scale(direction, 1);
  context.strokeStyle = rgbToRgba(palette.secondary, 0.5);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(45, -20, 80, -80, 116, -170);
  context.stroke();

  for (let leafIndex = 0; leafIndex < 5; leafIndex++) {
    const leafX = 25 + leafIndex * 19;
    const leafY = -28 - leafIndex * 30;
    context.fillStyle = rgbToRgba(leafIndex % 2 === 0 ? palette.primary : palette.secondary, 0.18);
    context.strokeStyle = rgbToRgba(palette.secondary, 0.55);
    context.beginPath();
    context.ellipse(leafX, leafY, 12, 27, leafIndex % 2 === 0 ? -0.55 : 0.55, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = V4_TEXT_COLOR;
    context.beginPath();
    context.arc(leafX, leafY, 2.4, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/**
 * Рисует графические акценты выбранного макета.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, tertiary: string}} palette
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawLayoutAccentsV4(context, palette, layout, seededRandom) {
  if (layout === 'classic' || layout === 'minimal') {
    drawOrbitalSystemV4(context, palette, seededRandom);
  }

  if (layout === 'corner' || layout === 'ribbon') {
    context.save();
    context.lineWidth = 5;
    context.strokeStyle = rgbToRgba(palette.primary, 0.62);
    context.beginPath();
    context.moveTo(56, 230);
    context.lineTo(56, 56);
    context.lineTo(230, 56);
    context.moveTo(CARD_WIDTH - 56, CARD_HEIGHT - 230);
    context.lineTo(CARD_WIDTH - 56, CARD_HEIGHT - 56);
    context.lineTo(CARD_WIDTH - 230, CARD_HEIGHT - 56);
    context.stroke();
    context.lineWidth = 1;
    context.strokeStyle = rgbToRgba(palette.secondary, 0.55);
    context.strokeRect(72, 72, CARD_WIDTH - 144, CARD_HEIGHT - 144);
    context.restore();
  }

  if (layout === 'botanical') {
    drawConstellationBranchV4(context, palette, 42, CARD_HEIGHT - 42, 1);
    drawConstellationBranchV4(context, palette, CARD_WIDTH - 42, 42, -1);
  }

  if (layout === 'ribbon') {
    context.save();
    context.globalCompositeOperation = 'screen';
    const diagonalGradient = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    diagonalGradient.addColorStop(0, rgbToRgba(palette.primary, 0));
    diagonalGradient.addColorStop(0.5, rgbToRgba(palette.primary, 0.18));
    diagonalGradient.addColorStop(1, rgbToRgba(palette.secondary, 0));
    context.fillStyle = diagonalGradient;
    context.translate(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    context.rotate(-0.24);
    context.fillRect(-CARD_WIDTH, -72, CARD_WIDTH * 2, 144);
    context.restore();
  }
}

/**
 * Рисует полупрозрачную капсулу для текста.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, panel: string}} palette
 * @returns {{left: number, top: number, width: number, height: number}}
 */
function drawGlassPanelV4(context, palette) {
  const panelRectangle = { left: 104, top: 288, width: 872, height: 774 };
  context.save();
  context.shadowColor = rgbToRgba(palette.primary, 0.28);
  context.shadowBlur = 60;
  traceRoundedRectangle(
    context,
    panelRectangle.left,
    panelRectangle.top,
    panelRectangle.width,
    panelRectangle.height,
    52,
  );
  const panelGradient = context.createLinearGradient(
    panelRectangle.left,
    panelRectangle.top,
    panelRectangle.left + panelRectangle.width,
    panelRectangle.top + panelRectangle.height,
  );
  panelGradient.addColorStop(0, rgbToRgba(blendColors(palette.panel, palette.primary, 0.08), 0.91));
  panelGradient.addColorStop(0.5, rgbToRgba(palette.panel, 0.83));
  panelGradient.addColorStop(1, rgbToRgba(blendColors(palette.panel, palette.secondary, 0.08), 0.92));
  context.fillStyle = panelGradient;
  context.fill();

  context.shadowBlur = 0;
  const borderGradient = context.createLinearGradient(
    panelRectangle.left,
    panelRectangle.top,
    panelRectangle.left + panelRectangle.width,
    panelRectangle.top + panelRectangle.height,
  );
  borderGradient.addColorStop(0, rgbToRgba(palette.primary, 0.85));
  borderGradient.addColorStop(0.45, 'rgba(255,255,255,0.13)');
  borderGradient.addColorStop(1, rgbToRgba(palette.secondary, 0.8));
  context.strokeStyle = borderGradient;
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = 'rgba(255,255,255,0.15)';
  traceRoundedRectangle(context, panelRectangle.left + 24, panelRectangle.top + 24, 132, 8, 4);
  context.fill();
  context.restore();
  return panelRectangle;
}

/**
 * Подбирает строки и размер основного текста внутри панели.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @returns {{lines: string[], fontSize: number, lineHeight: number}}
 */
function layoutPanelTextV4(context, wishText, fontStyle) {
  let fontSize = fontStyle === 'script' ? 112 : 86;
  let lines = [];
  let lineHeight = 0;

  for (let layoutAttempt = 0; layoutAttempt < 10; layoutAttempt++) {
    context.font = getMainFont(fontStyle, fontSize);
    lines = wrapTextLines(context, wishText, 720);
    lineHeight = fontSize * (fontStyle === 'script' ? 1.08 : 1.24);
    if (lines.length * lineHeight <= 470) {
      break;
    }
    fontSize -= 6;
  }
  assert(fontSize >= 32, `Expected readable font size >= 32, got ${fontSize}`);
  return { lines, fontSize, lineHeight };
}

/**
 * Рисует типографику и подпись.
 * @param {CanvasRenderingContext2D} context
 * @param {{primary: string, secondary: string, text: string}} palette
 * @param {string} wishText
 * @param {string} signatureText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @returns {void}
 */
function drawTypographyV4(context, palette, wishText, signatureText, fontStyle) {
  const textLayout = layoutPanelTextV4(context, wishText, fontStyle);
  const textBlockHeight = textLayout.lines.length * textLayout.lineHeight;
  const firstLineY = CARD_HEIGHT / 2 - textBlockHeight / 2 + textLayout.lineHeight / 2 - 4;
  const containsCyrillic = /[А-Яа-яЁё]/.test(wishText);

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 20px "Montserrat", sans-serif';
  context.letterSpacing = '5px';
  context.fillStyle = rgbToRgba(palette.secondary, 0.86);
  context.fillText(containsCyrillic ? '✦  ДЛЯ ТЕБЯ  ✦' : '✦  MADE FOR YOU  ✦', CARD_WIDTH / 2, 356);
  context.letterSpacing = '0px';

  for (let lineIndex = 0; lineIndex < textLayout.lines.length; lineIndex++) {
    const lineY = firstLineY + lineIndex * textLayout.lineHeight;
    if (fontStyle === 'mixed' && lineIndex === 0) {
      context.font = `italic ${textLayout.fontSize + 4}px "Playfair Display", Georgia, serif`;
    } else {
      context.font = getMainFont(fontStyle, textLayout.fontSize);
    }
    const textGradient = context.createLinearGradient(180, lineY, CARD_WIDTH - 180, lineY);
    textGradient.addColorStop(0, blendColors(palette.text, palette.primary, 0.08));
    textGradient.addColorStop(0.52, palette.text);
    textGradient.addColorStop(1, blendColors(palette.text, palette.secondary, 0.1));
    context.fillStyle = textGradient;
    context.shadowColor = rgbToRgba(palette.primary, 0.35);
    context.shadowBlur = 18;
    context.fillText(textLayout.lines[lineIndex], CARD_WIDTH / 2, lineY);
  }

  context.shadowBlur = 0;
  const dividerY = 964;
  const dividerGradient = context.createLinearGradient(300, dividerY, 780, dividerY);
  dividerGradient.addColorStop(0, rgbToRgba(palette.primary, 0));
  dividerGradient.addColorStop(0.5, rgbToRgba(palette.secondary, 0.7));
  dividerGradient.addColorStop(1, rgbToRgba(palette.primary, 0));
  context.strokeStyle = dividerGradient;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(300, dividerY);
  context.lineTo(780, dividerY);
  context.stroke();

  context.font = '46px "Caveat", cursive';
  context.fillStyle = rgbToRgba(palette.text, 0.82);
  context.fillText(signatureText, CARD_WIDTH / 2, 1011);
  context.restore();
}

/**
 * Генерирует открытку v4.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4', postProcessSeed: number} | null} [cardState]
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4', postProcessSeed: number, exportBackgroundColor: string}}}
 */
export function generateGreetingCardV4(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v4);
  assert(typeof state.text === 'string' && state.text.trim().length > 0, `Expected non-empty wish text, got "${state.text}"`);
  assert(typeof state.signature === 'string', `Expected signature string, got ${typeof state.signature}`);
  const postProcessSeed = state.postProcessSeed ?? createEntropySeed();
  const seededRandom = createSeededRandom(postProcessSeed);
  const palette = createCosmicPaletteV4(getPaletteForCategory(state.category));
  const canvas = getRenderCanvas();
  const context = getRenderContext();

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  fillOpaqueCanvasBase(context, V4_BACKGROUND_COLOR);
  drawCosmicBackgroundV4(context, palette);
  drawAuroraV4(context, palette, seededRandom);
  drawStarFieldV4(context, palette, seededRandom);
  drawLayoutAccentsV4(context, palette, state.layout, seededRandom);
  drawGlassPanelV4(context, palette);
  drawTypographyV4(context, palette, state.text, state.signature, state.fontStyle);

  const opaqueCanvas = flattenCanvasToOpaque(canvas, V4_BACKGROUND_COLOR);
  return {
    canvas: opaqueCanvas,
    cardState: {
      ...state,
      rendererVersion: CARD_RENDERER_VERSIONS.v4,
      postProcessSeed,
      exportBackgroundColor: V4_BACKGROUND_COLOR,
    },
  };
}
