import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_RENDERER_VERSIONS,
  assert,
  randomRange,
  randomInt,
  parseColor,
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
 * Рендер открыток v2 — больше декора, градиенты на всех поверхностях,
 * геометрические эффекты текста и пост-обработка цвета.
 */

/**
 * Создаёт линейный градиент между двумя цветами.
 * @param {CanvasRenderingContext2D} context
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {string} colorStart
 * @param {string} colorEnd
 * @returns {CanvasGradient}
 */
function createLinearColorGradient(context, startX, startY, endX, endY, colorStart, colorEnd) {
  const gradient = context.createLinearGradient(startX, startY, endX, endY);
  gradient.addColorStop(0, colorStart);
  gradient.addColorStop(1, colorEnd);
  return gradient;
}

/**
 * Создаёт радиальный градиент между двумя цветами.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} innerRadius
 * @param {number} outerRadius
 * @param {string} colorInner
 * @param {string} colorOuter
 * @returns {CanvasGradient}
 */
function createRadialColorGradient(context, centerX, centerY, innerRadius, outerRadius, colorInner, colorOuter) {
  const gradient = context.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
  gradient.addColorStop(0, colorInner);
  gradient.addColorStop(1, colorOuter);
  return gradient;
}

/**
 * Обогащает палитру для v2 — темнее текст, насыщеннее фон.
 * @param {{background: string[], accent: string, text: string, textShadow: string, decor: string}} palette
 * @returns {{background: string[], accent: string, text: string, textShadow: string, decor: string}}
 */
function enrichPaletteForV2(palette) {
  return {
    background: [
      blendColors(palette.background[0], palette.decor, 0.12),
      blendColors(palette.background[1], palette.accent, 0.14),
      blendColors(palette.background[2], palette.decor, 0.18),
    ],
    accent: blendColors(palette.accent, '#000000', 0.1),
    text: blendColors(palette.text, '#000000', 0.22),
    textShadow: 'rgba(0, 0, 0, 0.22)',
    decor: blendColors(palette.decor, palette.accent, 0.16),
  };
}

/**
 * Рисует фон v2 с несколькими градиентными слоями.
 * @param {CanvasRenderingContext2D} context
 * @param {{background: string[], accent: string, decor: string}} palette
 */
function drawPaperBackgroundV2(context, palette) {
  const baseAngle = randomRange(0, Math.PI * 2);
  const baseGradient = context.createLinearGradient(
    Math.cos(baseAngle) * CARD_WIDTH,
    Math.sin(baseAngle) * CARD_HEIGHT,
    CARD_WIDTH - Math.cos(baseAngle) * CARD_WIDTH,
    CARD_HEIGHT - Math.sin(baseAngle) * CARD_HEIGHT,
  );
  baseGradient.addColorStop(0, palette.background[0]);
  baseGradient.addColorStop(0.45, palette.background[1]);
  baseGradient.addColorStop(1, palette.background[2]);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const radialX = CARD_WIDTH * randomRange(0.25, 0.75);
  const radialY = CARD_HEIGHT * randomRange(0.2, 0.8);
  const radialGlow = context.createRadialGradient(radialX, radialY, 0, radialX, radialY, CARD_HEIGHT * 0.7);
  radialGlow.addColorStop(0, rgbToRgba(blendColors(palette.background[0], palette.decor, 0.2), 0.22));
  radialGlow.addColorStop(0.55, rgbToRgba(blendColors(palette.background[1], palette.accent, 0.12), 0.1));
  radialGlow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = radialGlow;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawGeometricBackgroundV2(context, palette);
  drawWatercolorWashesV2(context, palette);
  drawPaperNoiseV2(context);
  drawSoftVignetteV2(context);
}

/**
 * Геометрические акценты на фоне.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, background: string[]}} palette
 */
function drawGeometricBackgroundV2(context, palette) {
  const shapeCount = randomInt(6, 11);
  for (let shapeIndex = 0; shapeIndex < shapeCount; shapeIndex++) {
    const shapeX = randomRange(0, CARD_WIDTH);
    const shapeY = randomRange(0, CARD_HEIGHT);
    const shapeRadius = randomRange(40, 160);
    const shapeGradient = createRadialColorGradient(
      context,
      shapeX,
      shapeY,
      0,
      shapeRadius,
      rgbToRgba(blendColors(palette.decor, palette.background[0], 0.35), randomRange(0.12, 0.22)),
      'rgba(255,255,255,0)',
    );
    context.fillStyle = shapeGradient;
    context.beginPath();
    context.arc(shapeX, shapeY, shapeRadius, 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.globalAlpha = randomRange(0.1, 0.18);
  const lineCount = randomInt(4, 8);
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
    const lineStartX = randomRange(0, CARD_WIDTH);
    const lineStartY = randomRange(0, CARD_HEIGHT);
    const lineEndX = lineStartX + randomRange(-280, 280);
    const lineEndY = lineStartY + randomRange(-280, 280);
    const lineGradient = createLinearColorGradient(
      context,
      lineStartX,
      lineStartY,
      lineEndX,
      lineEndY,
      rgbToRgba(palette.accent, 0.12),
      rgbToRgba(palette.decor, 0.28),
    );
    context.strokeStyle = lineGradient;
    context.lineWidth = randomRange(0.8, 2.2);
    context.beginPath();
    context.moveTo(lineStartX, lineStartY);
    context.lineTo(lineEndX, lineEndY);
    context.stroke();
  }
  context.restore();
}

/**
 * Акварельные пятна с градиентом.
 * @param {CanvasRenderingContext2D} context
 * @param {{background: string[], decor: string}} palette
 */
function drawWatercolorWashesV2(context, palette) {
  const washCount = randomInt(3, 5);
  for (let washIndex = 0; washIndex < washCount; washIndex++) {
    const washX = randomRange(0, CARD_WIDTH);
    const washY = randomRange(0, CARD_HEIGHT);
    const washRadius = randomRange(160, 460);
    const washInner = blendColors(palette.decor, palette.background[washIndex % palette.background.length], 0.35);
    const washOuter = blendColors(palette.decor, palette.background[(washIndex + 1) % palette.background.length], 0.65);
    const washGradient = createRadialColorGradient(
      context,
      washX,
      washY,
      0,
      washRadius,
      rgbToRgba(washInner, randomRange(0.1, 0.16)),
      rgbToRgba(washOuter, randomRange(0.03, 0.07)),
    );
    context.fillStyle = washGradient;
    context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
}

/**
 * Текстура бумаги.
 * @param {CanvasRenderingContext2D} context
 */
function drawPaperNoiseV2(context) {
  const imageData = context.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const pixels = imageData.data;
  for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4) {
    const noise = (randomRange(0, 1) - 0.5) * 12;
    pixels[pixelIndex] = clampByte(pixels[pixelIndex] + noise);
    pixels[pixelIndex + 1] = clampByte(pixels[pixelIndex + 1] + noise * 0.92);
    pixels[pixelIndex + 2] = clampByte(pixels[pixelIndex + 2] + noise * 1.08);
  }
  context.putImageData(imageData, 0, 0);
}

/**
 * Виньетка с градиентом.
 * @param {CanvasRenderingContext2D} context
 */
function drawSoftVignetteV2(context) {
  const vignette = context.createRadialGradient(
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_HEIGHT * 0.2,
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_HEIGHT * 0.9,
  );
  vignette.addColorStop(0, 'rgba(255,255,255,0)');
  vignette.addColorStop(0.75, 'rgba(0,0,0,0.015)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.06)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Цветок с градиентными лепестками.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} petalRadius
 * @param {string} petalColor
 * @param {string} petalColorAlt
 * @param {number} petalCount
 */
function drawSimpleFlowerV2(context, centerX, centerY, petalRadius, petalColor, petalColorAlt, petalCount) {
  context.save();
  context.translate(centerX, centerY);
  context.globalAlpha = randomRange(0.45, 0.75);
  const angleStep = (Math.PI * 2) / petalCount;
  for (let petalIndex = 0; petalIndex < petalCount; petalIndex++) {
    const angle = angleStep * petalIndex + randomRange(-0.12, 0.12);
    context.save();
    context.rotate(angle);
    const petalGradient = createLinearColorGradient(
      context,
      -petalRadius * 0.2,
      -petalRadius * 0.3,
      petalRadius,
      petalRadius * 0.3,
      petalColor,
      petalColorAlt,
    );
    context.beginPath();
    context.ellipse(petalRadius * 0.55, 0, petalRadius * 0.5, petalRadius * 0.28, 0, 0, Math.PI * 2);
    context.fillStyle = petalGradient;
    context.fill();
    context.restore();
  }
  const centerGradient = createRadialColorGradient(
    context,
    0,
    0,
    0,
    petalRadius * 0.2,
    blendColors(petalColorAlt, '#8B6914', 0.35),
    blendColors(petalColor, '#5A4010', 0.5),
  );
  context.beginPath();
  context.arc(0, 0, petalRadius * 0.18, 0, Math.PI * 2);
  context.fillStyle = centerGradient;
  context.globalAlpha = randomRange(0.55, 0.75);
  context.fill();
  context.restore();
}

/**
 * Лист с градиентной заливкой.
 * @param {CanvasRenderingContext2D} context
 * @param {number} originX
 * @param {number} originY
 * @param {number} leafLength
 * @param {number} rotation
 * @param {string} leafColor
 * @param {string} leafColorAlt
 */
function drawLeafV2(context, originX, originY, leafLength, rotation, leafColor, leafColorAlt) {
  context.save();
  context.translate(originX, originY);
  context.rotate(rotation);
  context.globalAlpha = randomRange(0.32, 0.58);
  const leafGradient = createLinearColorGradient(context, 0, -leafLength * 0.2, leafLength, leafLength * 0.2, leafColor, leafColorAlt);
  context.beginPath();
  context.moveTo(0, 0);
  context.quadraticCurveTo(leafLength * 0.5, -leafLength * 0.35, leafLength, 0);
  context.quadraticCurveTo(leafLength * 0.5, leafLength * 0.35, 0, 0);
  context.fillStyle = leafGradient;
  context.fill();
  context.restore();
}

/**
 * Декоративная веточка v2.
 * @param {CanvasRenderingContext2D} context
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {number} scale
 * @param {string} decorColor
 * @param {number} mirrorX
 * @param {number} mirrorY
 */
function drawBotanicalCornerV2(context, anchorX, anchorY, scale, decorColor, mirrorX, mirrorY) {
  context.save();
  context.translate(anchorX, anchorY);
  context.scale(mirrorX * scale, mirrorY * scale);
  const leafColor = blendColors(decorColor, '#3A5A30', 0.25);
  const leafColorAlt = blendColors(decorColor, '#FFFFFF', 0.35);
  drawLeafV2(context, 0, 0, 120, randomRange(-0.3, 0.1), leafColor, leafColorAlt);
  drawLeafV2(context, 30, 20, 90, randomRange(0.2, 0.6), leafColorAlt, leafColor);
  drawSimpleFlowerV2(context, 80, 60, 45, decorColor, blendColors(decorColor, '#FFFFFF', 0.25), 5);
  drawSimpleFlowerV2(context, 140, 30, 32, blendColors(decorColor, '#FFFFFF', 0.15), blendColors(decorColor, paletteSafeAccent(decorColor), 0.3), 6);
  context.restore();
}

/**
 * Вспомогательный цвет для градиента лепестков.
 * @param {string} decorColor
 * @returns {string}
 */
function paletteSafeAccent(decorColor) {
  return blendColors(decorColor, '#FFD8A8', 0.35);
}

/**
 * Рамка с градиентным штрихом.
 * @param {CanvasRenderingContext2D} context
 * @param {string} accentColor
 * @param {string} decorColor
 */
function drawDelicateFrameV2(context, accentColor, decorColor) {
  const margin = randomRange(48, 72);
  const inset = margin + randomRange(8, 16);
  context.save();
  const outerGradient = createLinearColorGradient(
    context,
    margin,
    margin,
    CARD_WIDTH - margin,
    CARD_HEIGHT - margin,
    accentColor,
    blendColors(decorColor, accentColor, 0.45),
  );
  context.strokeStyle = outerGradient;
  context.globalAlpha = randomRange(0.38, 0.58);
  context.lineWidth = randomRange(1.5, 3);
  context.strokeRect(margin, margin, CARD_WIDTH - margin * 2, CARD_HEIGHT - margin * 2);

  const innerGradient = createLinearColorGradient(
    context,
    inset,
    inset,
    CARD_WIDTH - inset,
    CARD_HEIGHT - inset,
    blendColors(accentColor, '#FFFFFF', 0.35),
    blendColors(decorColor, '#000000', 0.15),
  );
  context.strokeStyle = innerGradient;
  context.globalAlpha = randomRange(0.28, 0.42);
  context.lineWidth = 1;
  context.strokeRect(inset, inset, CARD_WIDTH - inset * 2, CARD_HEIGHT - inset * 2);
  context.restore();
}

/**
 * Геометрические угловые акценты.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string}} palette
 */
function drawCornerGeometryV2(context, palette) {
  const corners = [
    [90, 90, 0],
    [CARD_WIDTH - 90, 90, Math.PI / 2],
    [CARD_WIDTH - 90, CARD_HEIGHT - 90, Math.PI],
    [90, CARD_HEIGHT - 90, Math.PI * 1.5],
  ];
  for (const [cornerX, cornerY, cornerAngle] of corners) {
    context.save();
    context.translate(cornerX, cornerY);
    context.rotate(cornerAngle + randomRange(-0.15, 0.15));
    const arcGradient = createLinearColorGradient(
      context,
      -60,
      -60,
      60,
      60,
      rgbToRgba(palette.accent, 0.18),
      rgbToRgba(palette.decor, 0.04),
    );
    context.strokeStyle = arcGradient;
    context.lineWidth = randomRange(1, 2.5);
    context.globalAlpha = randomRange(0.32, 0.52);
    context.beginPath();
    context.arc(0, 0, randomRange(36, 58), -Math.PI * 0.2, Math.PI * 0.55);
    context.stroke();

    const diamondGradient = createLinearColorGradient(
      context,
      -8,
      -8,
      8,
      8,
      blendColors(palette.decor, '#FFFFFF', 0.3),
      blendColors(palette.accent, palette.decor, 0.4),
    );
    context.fillStyle = diamondGradient;
    context.globalAlpha = randomRange(0.2, 0.38);
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(10, 0);
    context.lineTo(0, 10);
    context.lineTo(-10, 0);
    context.closePath();
    context.fill();
    context.restore();
  }
}

/**
 * Лента с градиентной заливкой.
 * @param {CanvasRenderingContext2D} context
 * @param {string} accentColor
 * @param {string} decorColor
 * @param {string} category
 */
function drawRibbonBannerV2(context, accentColor, decorColor, category) {
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
  context.globalAlpha = randomRange(0.55, 0.72);
  const bannerGradient = createLinearColorGradient(
    context,
    CARD_WIDTH / 2 - bannerWidth / 2,
    bannerY,
    CARD_WIDTH / 2 + bannerWidth / 2,
    bannerY + bannerHeight,
    accentColor,
    blendColors(decorColor, accentColor, 0.35),
  );
  context.fillStyle = bannerGradient;
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2 - bannerWidth / 2, bannerY);
  context.lineTo(CARD_WIDTH / 2 + bannerWidth / 2, bannerY);
  context.lineTo(CARD_WIDTH / 2 + bannerWidth / 2 + 20, bannerY + bannerHeight / 2);
  context.lineTo(CARD_WIDTH / 2 + bannerWidth / 2, bannerY + bannerHeight);
  context.lineTo(CARD_WIDTH / 2 - bannerWidth / 2, bannerY + bannerHeight);
  context.lineTo(CARD_WIDTH / 2 - bannerWidth / 2 - 20, bannerY + bannerHeight / 2);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.9;
  context.font = `44px "Montserrat", sans-serif`;
  context.fillStyle = createLinearColorGradient(context, 0, bannerY, 0, bannerY + bannerHeight, '#FFFFFF', blendColors('#FFFFFF', decorColor, 0.25));
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(symbol, CARD_WIDTH / 2, bannerY + bannerHeight / 2 + 1);
  context.restore();
}

/**
 * Рисует одну строку текста с геометрическими микро-эффектами посимвольно.
 * @param {CanvasRenderingContext2D} context
 * @param {string} lineText
 * @param {number} centerY
 * @param {number} fontSize
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {boolean} useItalic
 * @param {{text: string, accent: string, decor: string, textShadow: string}} palette
 */
function drawStyledTextLineV2(context, lineText, centerY, fontSize, fontStyle, useItalic, palette) {
  if (fontStyle === 'mixed' && useItalic) {
    context.font = `italic ${fontSize + 4}px "Playfair Display", Georgia, serif`;
  } else {
    context.font = getMainFont(fontStyle, fontSize);
  }

  const characters = [...lineText];
  const fullLineWidth = context.measureText(lineText).width;
  let cursorX = CARD_WIDTH / 2 - fullLineWidth / 2;
  const lineSkew = randomRange(-0.018, 0.018);

  context.save();
  context.translate(0, centerY);
  context.transform(1, 0, lineSkew, 1, 0, 0);
  context.translate(0, -centerY);

  for (let charIndex = 0; charIndex < characters.length; charIndex++) {
    const character = characters[charIndex];
    const charWidth = context.measureText(character).width;
    const charCenterX = cursorX + charWidth / 2;
    const charCenterY = centerY + randomRange(-2.5, 2.5);

    context.save();
    context.translate(charCenterX, charCenterY);
    context.rotate(randomRange(-0.045, 0.045));
    context.scale(randomRange(0.97, 1.03), randomRange(0.985, 1.015));
    context.globalAlpha = 1;

    const textColorDark = blendColors(palette.text, '#000000', 0.08);
    const textColorMid = palette.text;
    const textColorLight = blendColors(palette.text, palette.accent, 0.06);
    const textGradient = createLinearColorGradient(
      context,
      -charWidth * 0.6,
      -fontSize * 0.4,
      charWidth * 0.6,
      fontSize * 0.4,
      textColorDark,
      textColorLight,
    );
    context.fillStyle = textGradient;
    context.strokeStyle = rgbToRgba(blendColors(textColorMid, '#000000', 0.35), 0.45);
    context.lineWidth = randomRange(0.6, 1.1);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeText(character, 0, 0);
    context.fillText(character, 0, 0);
    context.fillText(character, 0, 0);
    context.restore();

    cursorX += charWidth + randomRange(-0.8, 1.2);
  }
  context.restore();
}

/**
 * Рисует основной текст v2.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {{text: string, accent: string, decor: string, textShadow: string}} palette
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 */
function drawWishTextV2(context, wishText, palette, fontStyle, layout) {
  const textLayout = layoutWishTextBlock(context, wishText, fontStyle, layout);
  const { lines, fontSize, lineHeight, startY } = textLayout;

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.28)';
  context.shadowBlur = randomRange(6, 11);
  context.shadowOffsetY = randomRange(2, 4);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineY = startY + lineIndex * lineHeight;
    drawStyledTextLineV2(context, lines[lineIndex], lineY, fontSize, fontStyle, lineIndex === 0, palette);
  }
  context.restore();
}

/**
 * Подпись v2 с градиентом и лёгким наклоном.
 * @param {CanvasRenderingContext2D} context
 * @param {string} accentColor
 * @param {string} decorColor
 * @param {string} signatureText
 * @param {{signatureY: number, signatureRotate: number, signatureAlpha: number}} signatureLayout
 */
function drawSubtleSignatureV2(context, accentColor, decorColor, signatureText, signatureLayout) {
  context.save();
  context.translate(CARD_WIDTH / 2, signatureLayout.signatureY);
  context.rotate(signatureLayout.signatureRotate);
  context.font = `56px "Montserrat", sans-serif`;
  context.fillStyle = createLinearColorGradient(
    context,
    -220,
    -20,
    220,
    20,
    blendColors(accentColor, '#000000', 0.45),
    blendColors(decorColor, '#000000', 0.25),
  );
  context.globalAlpha = signatureLayout.signatureAlpha;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillText(signatureText, 0, 0);
  context.restore();
}

/**
 * Дополнительные геометрические элементы.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string}} palette
 */
function drawExtraGeometryV2(context, palette) {
  context.save();
  // Инвариант: restore возвращает globalAlpha (и прочие стили) —
  // общий canvas иначе «заражает» следующие версии рендера.
  const ringCount = randomInt(3, 6);
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
    const ringX = randomRange(120, CARD_WIDTH - 120);
    const ringY = randomRange(180, CARD_HEIGHT - 180);
    const ringRadius = randomRange(18, 42);
    const ringGradient = createRadialColorGradient(
      context,
      ringX,
      ringY,
      ringRadius * 0.55,
      ringRadius,
      rgbToRgba(palette.decor, 0.02),
      rgbToRgba(palette.accent, randomRange(0.12, 0.22)),
    );
    context.strokeStyle = ringGradient;
    context.lineWidth = randomRange(0.8, 1.8);
    context.globalAlpha = randomRange(0.18, 0.32);
    context.beginPath();
    context.arc(ringX, ringY, ringRadius, randomRange(0, Math.PI), randomRange(Math.PI, Math.PI * 2));
    context.stroke();
  }

  const triangleCount = randomInt(2, 5);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const triX = randomRange(80, CARD_WIDTH - 80);
    const triY = randomRange(120, CARD_HEIGHT - 120);
    const triSize = randomRange(12, 28);
    const triGradient = createLinearColorGradient(
      context,
      triX - triSize,
      triY - triSize,
      triX + triSize,
      triY + triSize,
      rgbToRgba(blendColors(palette.decor, '#FFFFFF', 0.4), 0.12),
      rgbToRgba(palette.accent, 0.2),
    );
    context.fillStyle = triGradient;
    context.globalAlpha = randomRange(0.12, 0.24);
    context.beginPath();
    context.moveTo(triX, triY - triSize);
    context.lineTo(triX + triSize, triY + triSize * 0.6);
    context.lineTo(triX - triSize, triY + triSize * 0.6);
    context.closePath();
    context.fill();
  }
  context.restore();
}

/**
 * Декор v2.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string}} palette
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @param {string} category
 */
function drawLayoutDecorationsV2(context, palette, layout, category) {
  drawCornerGeometryV2(context, palette);
  drawExtraGeometryV2(context, palette);

  if (layout === 'classic' || layout === 'minimal') {
    drawDelicateFrameV2(context, palette.accent, palette.decor);
  }

  if (layout === 'corner' || layout === 'classic' || layout === 'botanical') {
    const scale = randomRange(0.85, 1.15);
    drawBotanicalCornerV2(context, 60, 60, scale, palette.decor, 1, 1);
    drawBotanicalCornerV2(context, CARD_WIDTH - 60, CARD_HEIGHT - 60, scale * 0.9, palette.decor, -1, -1);
  }

  if (layout === 'botanical') {
    drawBotanicalCornerV2(context, CARD_WIDTH - 80, 100, randomRange(0.7, 1.0), palette.decor, -1, 1);
    drawBotanicalCornerV2(context, 80, CARD_HEIGHT - 120, randomRange(0.6, 0.9), palette.decor, 1, -1);
    const flowerCount = randomInt(4, 7);
    for (let flowerIndex = 0; flowerIndex < flowerCount; flowerIndex++) {
      drawSimpleFlowerV2(
        context,
        randomRange(130, CARD_WIDTH - 130),
        randomRange(130, CARD_HEIGHT - 200),
        randomRange(22, 38),
        blendColors(palette.decor, '#FFFFFF', randomRange(0, 0.25)),
        blendColors(palette.decor, palette.accent, randomRange(0.1, 0.3)),
        randomInt(5, 8),
      );
    }
  }

  if (layout === 'ribbon') {
    drawRibbonBannerV2(context, palette.accent, palette.decor, category);
  }

  if (layout === 'minimal') {
    context.save();
    context.globalAlpha = 0.22;
    const dotCount = randomInt(14, 24);
    for (let dotIndex = 0; dotIndex < dotCount; dotIndex++) {
      const dotX = randomRange(100, CARD_WIDTH - 100);
      const dotY = randomRange(100, CARD_HEIGHT - 100);
      const dotRadius = randomRange(1.5, 3.5);
      const dotGradient = createRadialColorGradient(
        context,
        dotX,
        dotY,
        0,
        dotRadius,
        rgbToRgba(palette.decor, 0.35),
        rgbToRgba(palette.accent, 0.05),
      );
      context.fillStyle = dotGradient;
      context.beginPath();
      context.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}

/**
 * Неравномерная пост-обработка цвета для усложнения сопоставления изображений.
 * @param {CanvasRenderingContext2D} context
 * @param {number} seed
 */
export function applyNonUniformColorPostProcess(context, seed) {
  const imageData = context.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const pixels = imageData.data;
  const blockSize = 14;

  for (let blockY = 0; blockY < CARD_HEIGHT; blockY += blockSize) {
    for (let blockX = 0; blockX < CARD_WIDTH; blockX += blockSize) {
      const blockWave = Math.sin(blockX * 0.007 + seed) * Math.cos(blockY * 0.005 + seed * 1.17);
      const blockRedShift = blockWave * 5.5;
      const blockGreenShift = Math.sin(seed * 0.8 + blockX * 0.009) * 3.5;
      const blockBlueShift = Math.cos(seed * 1.1 + blockY * 0.008) * 4.2;

      for (let localY = 0; localY < blockSize && blockY + localY < CARD_HEIGHT; localY++) {
        for (let localX = 0; localX < blockSize && blockX + localX < CARD_WIDTH; localX++) {
          const pixelX = blockX + localX;
          const pixelY = blockY + localY;
          const pixelIndex = (pixelY * CARD_WIDTH + pixelX) * 4;
          const fineWave = Math.sin(pixelX * 0.028 + seed * 0.42) * Math.cos(pixelY * 0.024 + seed * 0.31);
          pixels[pixelIndex] = clampByte(pixels[pixelIndex] + blockRedShift + fineWave * 2.2);
          pixels[pixelIndex + 1] = clampByte(pixels[pixelIndex + 1] + blockGreenShift + fineWave * 1.6);
          pixels[pixelIndex + 2] = clampByte(pixels[pixelIndex + 2] + blockBlueShift + fineWave * 2.5);

          const contrastFactor = 1.06;
          pixels[pixelIndex] = clampByte((pixels[pixelIndex] - 128) * contrastFactor + 128);
          pixels[pixelIndex + 1] = clampByte((pixels[pixelIndex + 1] - 128) * contrastFactor + 128);
          pixels[pixelIndex + 2] = clampByte((pixels[pixelIndex + 2] - 128) * contrastFactor + 128);
        }
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

/**
 * Генерирует открытку v2.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2', postProcessSeed: number}} cardState
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2', postProcessSeed: number}}}
 */
export function generateGreetingCardV2(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v2);
  assert(state.text.trim().length > 0, 'Wish text must not be empty');
  const palette = enrichPaletteForV2(getPaletteForCategory(state.category));
  const postProcessSeed = state.postProcessSeed ?? createEntropySeed();

  const canvas = getRenderCanvas();
  const context = getRenderContext();
  assert(context !== null, 'Render context is null');

  runWithCardSeed(postProcessSeed, () => {
    context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    fillOpaqueCanvasBase(context, palette.background[0]);
    drawPaperBackgroundV2(context, palette);
    drawLayoutDecorationsV2(context, palette, state.layout, state.category);
    // Фиксируем layout подписи до текста — иначе длина текста сдвигает PRNG.
    const signatureLayout = {
      signatureY: CARD_HEIGHT - randomRange(80, 110),
      signatureRotate: randomRange(-0.025, 0.025),
      signatureAlpha: randomRange(0.72, 0.88),
    };
    drawWishTextV2(context, state.text, palette, state.fontStyle, state.layout);
    drawSubtleSignatureV2(context, palette.accent, palette.decor, state.signature, signatureLayout);
    applyNonUniformColorPostProcess(context, postProcessSeed);
  });

  const opaqueCanvas = flattenCanvasToOpaque(canvas, palette.background[0]);
  return {
    canvas: opaqueCanvas,
    cardState: {
      ...state,
      rendererVersion: CARD_RENDERER_VERSIONS.v2,
      postProcessSeed,
      exportBackgroundColor: palette.background[0],
    },
  };
}
