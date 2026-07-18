import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_RENDERER_VERSIONS,
  assert,
  randomRange,
  randomInt,
  blendColors,
  rgbToRgba,
  clampByte,
  getMainFont,
  layoutWishTextBlock,
  createRandomCardState,
  getRenderCanvas,
  getRenderContext,
  fillOpaqueCanvasBase,
  flattenCanvasToOpaque,
  createEntropySeed,
  runWithCardSeed,
} from './generator-shared.js';
import { getPaletteForCategory } from './themes.js';

/**
 * Рендер открыток v1 — классический стиль (исходная версия).
 */

/**
 * Рисует фон с мягким градиентом и бумажной текстурой.
 * @param {CanvasRenderingContext2D} context
 * @param {{background: string[], accent: string}} palette
 */
function drawPaperBackgroundV1(context, palette) {
  const angle = randomRange(0, Math.PI * 2);
  const centerX = CARD_WIDTH * randomRange(0.3, 0.7);
  const centerY = CARD_HEIGHT * randomRange(0.3, 0.7);
  const radius = Math.max(CARD_WIDTH, CARD_HEIGHT) * randomRange(0.8, 1.2);

  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, palette.background[0]);
  gradient.addColorStop(0.55, palette.background[1]);
  gradient.addColorStop(1, palette.background[2]);

  context.fillStyle = gradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const overlay = context.createLinearGradient(
    Math.cos(angle) * CARD_WIDTH,
    Math.sin(angle) * CARD_HEIGHT,
    CARD_WIDTH - Math.cos(angle) * CARD_WIDTH,
    CARD_HEIGHT - Math.sin(angle) * CARD_HEIGHT,
  );
  overlay.addColorStop(0, 'rgba(255,255,255,0.12)');
  overlay.addColorStop(0.5, 'rgba(255,255,255,0)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.04)');
  context.fillStyle = overlay;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawWatercolorWashesV1(context, palette);
  drawPaperNoiseV1(context);
  drawSoftVignetteV1(context);
}

/**
 * Мягкие акварельные пятна.
 * @param {CanvasRenderingContext2D} context
 * @param {{background: string[], decor: string}} palette
 */
function drawWatercolorWashesV1(context, palette) {
  const washCount = randomInt(2, 4);
  for (let washIndex = 0; washIndex < washCount; washIndex++) {
    const washX = randomRange(0, CARD_WIDTH);
    const washY = randomRange(0, CARD_HEIGHT);
    const washRadius = randomRange(180, 420);
    const washColor = blendColors(
      palette.decor,
      palette.background[washIndex % palette.background.length],
      randomRange(0.3, 0.6),
    );
    const washGradient = context.createRadialGradient(washX, washY, 0, washX, washY, washRadius);
    washGradient.addColorStop(0, rgbToRgba(washColor, randomRange(0.12, 0.22)));
    washGradient.addColorStop(0.6, rgbToRgba(washColor, randomRange(0.04, 0.08)));
    washGradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = washGradient;
    context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
}

/**
 * Имитация текстуры бумаги через мелкий шум.
 * @param {CanvasRenderingContext2D} context
 */
function drawPaperNoiseV1(context) {
  const imageData = context.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const pixels = imageData.data;
  for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4) {
    const noise = (randomRange(0, 1) - 0.5) * 14;
    pixels[pixelIndex] = clampByte(pixels[pixelIndex] + noise);
    pixels[pixelIndex + 1] = clampByte(pixels[pixelIndex + 1] + noise);
    pixels[pixelIndex + 2] = clampByte(pixels[pixelIndex + 2] + noise);
  }
  context.putImageData(imageData, 0, 0);
}

/**
 * Мягкая виньетка по краям.
 * @param {CanvasRenderingContext2D} context
 */
function drawSoftVignetteV1(context) {
  const vignette = context.createRadialGradient(
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_HEIGHT * 0.25,
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_HEIGHT * 0.85,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.07)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Рисует простой цветок.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} petalRadius
 * @param {string} petalColor
 * @param {number} petalCount
 */
function drawSimpleFlowerV1(context, centerX, centerY, petalRadius, petalColor, petalCount) {
  context.save();
  context.translate(centerX, centerY);
  context.globalAlpha = randomRange(0.35, 0.65);
  const angleStep = (Math.PI * 2) / petalCount;
  for (let petalIndex = 0; petalIndex < petalCount; petalIndex++) {
    const angle = angleStep * petalIndex + randomRange(-0.1, 0.1);
    context.save();
    context.rotate(angle);
    context.beginPath();
    context.ellipse(petalRadius * 0.55, 0, petalRadius * 0.5, petalRadius * 0.28, 0, 0, Math.PI * 2);
    context.fillStyle = petalColor;
    context.fill();
    context.restore();
  }
  context.beginPath();
  context.arc(0, 0, petalRadius * 0.18, 0, Math.PI * 2);
  context.fillStyle = blendColors(petalColor, '#8B6914', 0.4);
  context.globalAlpha = randomRange(0.5, 0.7);
  context.fill();
  context.restore();
}

/**
 * Рисует лист.
 * @param {CanvasRenderingContext2D} context
 * @param {number} originX
 * @param {number} originY
 * @param {number} leafLength
 * @param {number} rotation
 * @param {string} leafColor
 */
function drawLeafV1(context, originX, originY, leafLength, rotation, leafColor) {
  context.save();
  context.translate(originX, originY);
  context.rotate(rotation);
  context.globalAlpha = randomRange(0.3, 0.55);
  context.beginPath();
  context.moveTo(0, 0);
  context.quadraticCurveTo(leafLength * 0.5, -leafLength * 0.35, leafLength, 0);
  context.quadraticCurveTo(leafLength * 0.5, leafLength * 0.35, 0, 0);
  context.fillStyle = leafColor;
  context.fill();
  context.restore();
}

/**
 * Декоративная веточка в углу.
 * @param {CanvasRenderingContext2D} context
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {number} scale
 * @param {string} decorColor
 * @param {number} mirrorX
 * @param {number} mirrorY
 */
function drawBotanicalCornerV1(context, anchorX, anchorY, scale, decorColor, mirrorX, mirrorY) {
  context.save();
  context.translate(anchorX, anchorY);
  context.scale(mirrorX * scale, mirrorY * scale);
  const leafColor = blendColors(decorColor, '#3A5A30', 0.25);
  drawLeafV1(context, 0, 0, 120, randomRange(-0.3, 0.1), leafColor);
  drawLeafV1(context, 30, 20, 90, randomRange(0.2, 0.6), leafColor);
  drawSimpleFlowerV1(context, 80, 60, 45, decorColor, 5);
  drawSimpleFlowerV1(context, 140, 30, 32, blendColors(decorColor, '#FFFFFF', 0.2), 6);
  context.restore();
}

/**
 * Тонкая декоративная рамка.
 * @param {CanvasRenderingContext2D} context
 * @param {string} accentColor
 */
function drawDelicateFrameV1(context, accentColor) {
  const margin = randomRange(48, 72);
  const inset = margin + randomRange(8, 16);
  context.save();
  context.strokeStyle = accentColor;
  context.globalAlpha = randomRange(0.25, 0.45);
  context.lineWidth = randomRange(1, 2.5);
  context.strokeRect(margin, margin, CARD_WIDTH - margin * 2, CARD_HEIGHT - margin * 2);
  context.globalAlpha = randomRange(0.15, 0.3);
  context.lineWidth = 1;
  context.strokeRect(inset, inset, CARD_WIDTH - inset * 2, CARD_HEIGHT - inset * 2);
  context.restore();
}

/**
 * Декоративная лента с заголовком.
 * @param {CanvasRenderingContext2D} context
 * @param {string} accentColor
 * @param {string} category
 */
function drawRibbonBannerV1(context, accentColor, category) {
  const bannerLabels = {
    morning: 'утро',
    day: 'день',
    evening: 'вечер',
    health: 'здоровье',
    success: 'успех',
    mood: 'настроение',
    friendship: 'дружба',
    warmth: 'тепло',
    gratitude: 'благодарность',
    holiday: 'праздник',
  };
  const symbol = bannerLabels[category] ?? 'пожелание';
  const bannerY = randomRange(100, 160);
  const bannerWidth = randomRange(280, 380);
  const bannerHeight = 56;

  context.save();
  context.globalAlpha = randomRange(0.35, 0.55);
  context.fillStyle = accentColor;
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2 - bannerWidth / 2, bannerY);
  context.lineTo(CARD_WIDTH / 2 + bannerWidth / 2, bannerY);
  context.lineTo(CARD_WIDTH / 2 + bannerWidth / 2 + 20, bannerY + bannerHeight / 2);
  context.lineTo(CARD_WIDTH / 2 + bannerWidth / 2, bannerY + bannerHeight);
  context.lineTo(CARD_WIDTH / 2 - bannerWidth / 2, bannerY + bannerHeight);
  context.lineTo(CARD_WIDTH / 2 - bannerWidth / 2 - 20, bannerY + bannerHeight / 2);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.85;
  context.font = `44px "Montserrat", sans-serif`;
  context.fillStyle = '#FFFFFF';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(symbol, CARD_WIDTH / 2, bannerY + bannerHeight / 2 + 1);
  context.restore();
}

/**
 * Рисует основной текст пожелания.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {{text: string, textShadow: string}} palette
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 */
function drawWishTextV1(context, wishText, palette, fontStyle, layout) {
  const textLayout = layoutWishTextBlock(context, wishText, fontStyle, layout);
  const { lines, fontSize, lineHeight, startY } = textLayout;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = palette.text;

  context.save();
  context.shadowColor = palette.textShadow;
  context.shadowBlur = 6;
  context.shadowOffsetY = 2;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineY = startY + lineIndex * lineHeight;
    const lineText = lines[lineIndex];
    if (fontStyle === 'mixed' && lineIndex === 0) {
      context.font = `italic ${fontSize + 4}px "Playfair Display", Georgia, serif`;
    } else {
      context.font = getMainFont(fontStyle, fontSize);
    }
    context.fillText(lineText, CARD_WIDTH / 2, lineY);
  }
  context.restore();
}

/**
 * Мелкая подпись внизу.
 * @param {CanvasRenderingContext2D} context
 * @param {string} accentColor
 * @param {string} signatureText
 */
function drawSubtleSignatureV1(context, accentColor, signatureText, signatureLayout) {
  context.save();
  context.font = `56px "Montserrat", sans-serif`;
  context.fillStyle = blendColors(accentColor, '#000000', 0.35);
  context.globalAlpha = signatureLayout.signatureAlpha;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillText(signatureText, CARD_WIDTH / 2, signatureLayout.signatureY);
  context.restore();
}

/**
 * Применяет декор в зависимости от макета.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string}} palette
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @param {string} category
 */
function drawLayoutDecorationsV1(context, palette, layout, category) {
  if (layout === 'classic' || layout === 'minimal') {
    drawDelicateFrameV1(context, palette.accent);
  }

  if (layout === 'corner' || layout === 'classic' || layout === 'botanical') {
    const scale = randomRange(0.85, 1.15);
    drawBotanicalCornerV1(context, 60, 60, scale, palette.decor, 1, 1);
    drawBotanicalCornerV1(context, CARD_WIDTH - 60, CARD_HEIGHT - 60, scale * 0.9, palette.decor, -1, -1);
  }

  if (layout === 'botanical') {
    drawBotanicalCornerV1(context, CARD_WIDTH - 80, 100, randomRange(0.7, 1.0), palette.decor, -1, 1);
    drawBotanicalCornerV1(context, 80, CARD_HEIGHT - 120, randomRange(0.6, 0.9), palette.decor, 1, -1);
    const flowerCount = randomInt(2, 4);
    for (let flowerIndex = 0; flowerIndex < flowerCount; flowerIndex++) {
      drawSimpleFlowerV1(
        context,
        randomRange(150, CARD_WIDTH - 150),
        randomRange(150, CARD_HEIGHT - 200),
        randomRange(25, 40),
        blendColors(palette.decor, '#FFFFFF', randomRange(0, 0.3)),
        randomInt(5, 7),
      );
    }
  }

  if (layout === 'ribbon') {
    drawRibbonBannerV1(context, palette.accent, category);
  }

  if (layout === 'minimal') {
    context.save();
    context.strokeStyle = palette.decor;
    context.globalAlpha = 0.2;
    context.lineWidth = 1;
    const dotCount = randomInt(8, 14);
    for (let dotIndex = 0; dotIndex < dotCount; dotIndex++) {
      const dotX = randomRange(100, CARD_WIDTH - 100);
      const dotY = randomRange(100, CARD_HEIGHT - 100);
      context.beginPath();
      context.arc(dotX, dotY, randomRange(1.5, 3), 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }
}

/**
 * Генерирует открытку v1.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2', postProcessSeed: number}} cardState
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2', postProcessSeed: number}}}
 */
export function generateGreetingCardV1(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v1);
  assert(state.text.trim().length > 0, 'Wish text must not be empty');
  const palette = getPaletteForCategory(state.category);
  const postProcessSeed = state.postProcessSeed ?? createEntropySeed();

  const canvas = getRenderCanvas();
  const context = getRenderContext();
  assert(context !== null, 'Render context is null');

  runWithCardSeed(postProcessSeed, () => {
    context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    fillOpaqueCanvasBase(context, palette.background[0]);
    drawPaperBackgroundV1(context, palette);
    drawLayoutDecorationsV1(context, palette, state.layout, state.category);
    const signatureLayout = {
      signatureY: CARD_HEIGHT - randomRange(80, 110),
      signatureAlpha: randomRange(0.45, 0.65),
    };
    drawWishTextV1(context, state.text, palette, state.fontStyle, state.layout);
    drawSubtleSignatureV1(context, palette.accent, state.signature, signatureLayout);
  });

  const opaqueCanvas = flattenCanvasToOpaque(canvas, palette.background[0]);
  return {
    canvas: opaqueCanvas,
    cardState: {
      ...state,
      rendererVersion: CARD_RENDERER_VERSIONS.v1,
      postProcessSeed,
      exportBackgroundColor: palette.background[0],
    },
  };
}
