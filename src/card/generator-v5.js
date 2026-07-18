import {
  CARD_HEIGHT,
  CARD_RENDERER_VERSIONS,
  CARD_WIDTH,
  assert,
  blendColors,
  createRandomCardState,
  fillOpaqueCanvasBase,
  flattenCanvasToOpaque,
  getMainFont,
  getRenderCanvas,
  getRenderContext,
  rgbToRgba,
  wrapTextLines,
} from './generator-shared.js';
import { getPaletteForCategory } from './themes.js';

/**
 * Рендер открыток v5 — «Ар-деко · золотой час»:
 * бархатный фон, солнечный веер лучей, золотая фольга,
 * геометрическая рамка с веерами и арочная сцена для текста.
 */

const V5_INK_COLOR = '#141018';
const V5_TEXT_COLOR = '#FBF4E4';
const V5_GOLD_LIGHT = '#F7E7A9';
const V5_GOLD_MID = '#D9AE5F';
const V5_GOLD_DEEP = '#8F6B2E';

/**
 * Создаёт воспроизводимый генератор чисел для одного состояния открытки.
 * @param {number} seed
 * @returns {() => number}
 */
function createSeededRandomV5(seed) {
  assert(Number.isFinite(seed), `Expected finite seed, got ${seed}`);
  let currentState = Math.floor(seed * 1000) >>> 0;
  return () => {
    currentState += 0x6D2B79F5;
    let mixedState = currentState;
    mixedState = Math.imul(mixedState ^ (mixedState >>> 15), mixedState | 1);
    mixedState ^= mixedState + Math.imul(mixedState ^ (mixedState >>> 7), mixedState | 61);
    return ((mixedState ^ (mixedState >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Возвращает число в диапазоне [minimum, maximum).
 * @param {() => number} seededRandom
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
function seededRangeV5(seededRandom, minimum, maximum) {
  assert(maximum > minimum, `Expected maximum > minimum, got ${maximum} <= ${minimum}`);
  return minimum + seededRandom() * (maximum - minimum);
}

/**
 * @typedef {{
 *   velvetTop: string,
 *   velvetBottom: string,
 *   goldLight: string,
 *   goldMid: string,
 *   goldDeep: string,
 *   accent: string,
 *   panel: string,
 *   text: string,
 * }} DecoPaletteV5
 */

/**
 * Строит бархатно-золотую палитру ар-деко из палитры категории.
 * @param {{background: string[], accent: string, text: string, textShadow: string, decor: string}} sourcePalette
 * @returns {DecoPaletteV5}
 */
function createDecoPaletteV5(sourcePalette) {
  const velvetBase = blendColors(sourcePalette.accent, V5_INK_COLOR, 0.72);
  return {
    velvetTop: blendColors(velvetBase, sourcePalette.decor, 0.16),
    velvetBottom: blendColors(velvetBase, '#05030A', 0.55),
    goldLight: blendColors(V5_GOLD_LIGHT, sourcePalette.decor, 0.14),
    goldMid: blendColors(V5_GOLD_MID, sourcePalette.accent, 0.18),
    goldDeep: blendColors(V5_GOLD_DEEP, sourcePalette.accent, 0.22),
    accent: blendColors(sourcePalette.accent, V5_GOLD_MID, 0.35),
    panel: blendColors(velvetBase, '#FFFFFF', 0.045),
    text: V5_TEXT_COLOR,
  };
}

/**
 * Создаёт вертикальный градиент «золотой фольги».
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {number} topY
 * @param {number} bottomY
 * @returns {CanvasGradient}
 */
function createGoldFoilGradientV5(context, palette, topY, bottomY) {
  const foilGradient = context.createLinearGradient(0, topY, 0, bottomY);
  foilGradient.addColorStop(0, palette.goldLight);
  foilGradient.addColorStop(0.35, palette.goldMid);
  foilGradient.addColorStop(0.62, palette.goldLight);
  foilGradient.addColorStop(1, palette.goldDeep);
  return foilGradient;
}

/**
 * Рисует глубокий бархатный фон с виньеткой.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @returns {void}
 */
function drawVelvetBackgroundV5(context, palette) {
  const velvetGradient = context.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  velvetGradient.addColorStop(0, palette.velvetTop);
  velvetGradient.addColorStop(0.55, blendColors(palette.velvetTop, palette.velvetBottom, 0.5));
  velvetGradient.addColorStop(1, palette.velvetBottom);
  context.fillStyle = velvetGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glowGradient = context.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT * 0.34, 0,
    CARD_WIDTH / 2, CARD_HEIGHT * 0.34, CARD_HEIGHT * 0.72,
  );
  glowGradient.addColorStop(0, rgbToRgba(palette.goldMid, 0.16));
  glowGradient.addColorStop(0.5, rgbToRgba(palette.goldDeep, 0.05));
  glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glowGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const vignetteGradient = context.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_HEIGHT * 0.36,
    CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_HEIGHT * 0.86,
  );
  vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignetteGradient.addColorStop(1, 'rgba(2, 1, 6, 0.5)');
  context.fillStyle = vignetteGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Рисует веер солнечных лучей от верхней дуги — фирменный мотив ар-деко.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawSunburstV5(context, palette, seededRandom) {
  const sunCenterX = CARD_WIDTH / 2;
  const sunCenterY = CARD_HEIGHT * 0.335;
  const rayCount = 26;
  const rayInnerRadius = 168;
  const rayOuterRadius = 980;
  const rayPhase = seededRangeV5(seededRandom, -0.06, 0.06);

  context.save();
  // Инвариант цикла: после итерации rayIndex нарисованы лучи 0..rayIndex,
  // чередующиеся по прозрачности через один.
  for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
    const rayAngle = Math.PI + (rayIndex / (rayCount - 1)) * Math.PI + rayPhase;
    const rayHalfWidth = Math.PI / rayCount / 2.6;
    const rayAlpha = rayIndex % 2 === 0 ? 0.11 : 0.045;
    const rayGradient = context.createRadialGradient(
      sunCenterX, sunCenterY, rayInnerRadius,
      sunCenterX, sunCenterY, rayOuterRadius,
    );
    rayGradient.addColorStop(0, rgbToRgba(palette.goldLight, rayAlpha));
    rayGradient.addColorStop(1, rgbToRgba(palette.goldDeep, 0));
    context.fillStyle = rayGradient;
    context.beginPath();
    context.moveTo(
      sunCenterX + Math.cos(rayAngle - rayHalfWidth) * rayInnerRadius,
      sunCenterY + Math.sin(rayAngle - rayHalfWidth) * rayInnerRadius,
    );
    context.arc(sunCenterX, sunCenterY, rayOuterRadius, rayAngle - rayHalfWidth, rayAngle + rayHalfWidth);
    context.lineTo(
      sunCenterX + Math.cos(rayAngle + rayHalfWidth) * rayInnerRadius,
      sunCenterY + Math.sin(rayAngle + rayHalfWidth) * rayInnerRadius,
    );
    context.arc(sunCenterX, sunCenterY, rayInnerRadius, rayAngle + rayHalfWidth, rayAngle - rayHalfWidth, true);
    context.closePath();
    context.fill();
  }

  for (let haloIndex = 0; haloIndex < 3; haloIndex++) {
    context.strokeStyle = rgbToRgba(palette.goldMid, 0.34 - haloIndex * 0.09);
    context.lineWidth = haloIndex === 0 ? 2.4 : 1.2;
    context.beginPath();
    context.arc(sunCenterX, sunCenterY, rayInnerRadius + 16 + haloIndex * 15, Math.PI, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

/**
 * Рисует золотой веер из тонких лучей в углу карты.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {number} cornerX
 * @param {number} cornerY
 * @param {number} startAngle — начало сектора веера (радианы)
 * @returns {void}
 */
function drawCornerFanV5(context, palette, cornerX, cornerY, startAngle) {
  const bladeCount = 7;
  const fanRadius = 210;
  context.save();
  context.translate(cornerX, cornerY);
  for (let bladeIndex = 0; bladeIndex <= bladeCount; bladeIndex++) {
    const bladeAngle = startAngle + (bladeIndex / bladeCount) * (Math.PI / 2);
    const bladeRadius = bladeIndex % 2 === 0 ? fanRadius : fanRadius * 0.68;
    context.strokeStyle = rgbToRgba(palette.goldMid, bladeIndex % 2 === 0 ? 0.7 : 0.42);
    context.lineWidth = bladeIndex % 2 === 0 ? 2.2 : 1.1;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(bladeAngle) * bladeRadius, Math.sin(bladeAngle) * bladeRadius);
    context.stroke();
  }
  context.strokeStyle = rgbToRgba(palette.goldLight, 0.75);
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, fanRadius * 0.42, startAngle, startAngle + Math.PI / 2);
  context.stroke();
  context.beginPath();
  context.arc(0, 0, fanRadius * 0.3, startAngle, startAngle + Math.PI / 2);
  context.stroke();
  context.restore();
}

/**
 * Рисует ромб — атом орнамента ар-деко.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} halfWidth
 * @param {number} halfHeight
 * @returns {void}
 */
function traceDiamondV5(context, centerX, centerY, halfWidth, halfHeight) {
  assert(halfWidth > 0 && halfHeight > 0, `Expected positive diamond, got ${halfWidth}x${halfHeight}`);
  context.beginPath();
  context.moveTo(centerX, centerY - halfHeight);
  context.lineTo(centerX + halfWidth, centerY);
  context.lineTo(centerX, centerY + halfHeight);
  context.lineTo(centerX - halfWidth, centerY);
  context.closePath();
}

/**
 * Рисует двойную золотую рамку с ромбами на осях.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @returns {void}
 */
function drawDecoFrameV5(context, palette) {
  const outerInset = 44;
  const innerInset = 62;
  context.save();
  context.strokeStyle = createGoldFoilGradientV5(context, palette, outerInset, CARD_HEIGHT - outerInset);
  context.lineWidth = 3;
  context.strokeRect(outerInset, outerInset, CARD_WIDTH - outerInset * 2, CARD_HEIGHT - outerInset * 2);
  context.lineWidth = 1.2;
  context.strokeRect(innerInset, innerInset, CARD_WIDTH - innerInset * 2, CARD_HEIGHT - innerInset * 2);

  const axisMidpoints = [
    [CARD_WIDTH / 2, outerInset],
    [CARD_WIDTH / 2, CARD_HEIGHT - outerInset],
    [outerInset, CARD_HEIGHT / 2],
    [CARD_WIDTH - outerInset, CARD_HEIGHT / 2],
  ];
  for (const [diamondX, diamondY] of axisMidpoints) {
    context.fillStyle = palette.velvetBottom;
    traceDiamondV5(context, diamondX, diamondY, 26, 15);
    context.fill();
    context.strokeStyle = rgbToRgba(palette.goldLight, 0.9);
    context.lineWidth = 1.6;
    context.stroke();
    context.fillStyle = rgbToRgba(palette.goldMid, 0.95);
    traceDiamondV5(context, diamondX, diamondY, 11, 6.5);
    context.fill();
  }
  context.restore();
}

/**
 * Рисует ступенчатую пирамидку — навершие арки в стиле Крайслер-билдинг.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {number} apexX
 * @param {number} apexY
 * @returns {void}
 */
function drawSteppedCrownV5(context, palette, apexX, apexY) {
  const stepWidths = [150, 104, 62, 26];
  const stepHeight = 11;
  context.save();
  for (let stepIndex = 0; stepIndex < stepWidths.length; stepIndex++) {
    const stepY = apexY - stepIndex * (stepHeight + 4);
    context.fillStyle = rgbToRgba(palette.goldMid, 0.32 + stepIndex * 0.16);
    context.fillRect(apexX - stepWidths[stepIndex] / 2, stepY - stepHeight, stepWidths[stepIndex], stepHeight);
  }
  context.fillStyle = palette.goldLight;
  traceDiamondV5(context, apexX, apexY - stepWidths.length * (stepHeight + 4) - 6, 7, 13);
  context.fill();
  context.restore();
}

/**
 * Рисует арочную сцену для текста с золотым кантом.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @returns {{left: number, top: number, width: number, height: number, archRadius: number}}
 */
function drawArchStageV5(context, palette) {
  const stage = { left: 150, top: 320, width: 780, height: 760, archRadius: 390 };
  const archCenterX = stage.left + stage.width / 2;
  const archCenterY = stage.top + stage.archRadius;

  context.save();
  context.beginPath();
  context.moveTo(stage.left, stage.top + stage.height);
  context.lineTo(stage.left, archCenterY);
  context.arc(archCenterX, archCenterY, stage.archRadius, Math.PI, Math.PI * 2);
  context.lineTo(stage.left + stage.width, stage.top + stage.height);
  context.closePath();

  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 46;
  context.shadowOffsetY = 14;
  const stageGradient = context.createLinearGradient(0, stage.top, 0, stage.top + stage.height);
  stageGradient.addColorStop(0, rgbToRgba(blendColors(palette.panel, palette.goldDeep, 0.1), 0.94));
  stageGradient.addColorStop(0.5, rgbToRgba(palette.panel, 0.9));
  stageGradient.addColorStop(1, rgbToRgba(blendColors(palette.panel, '#05030A', 0.3), 0.95));
  context.fillStyle = stageGradient;
  context.fill();

  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.strokeStyle = createGoldFoilGradientV5(context, palette, stage.top, stage.top + stage.height);
  context.lineWidth = 3;
  context.stroke();

  context.beginPath();
  context.moveTo(stage.left + 20, stage.top + stage.height - 20);
  context.lineTo(stage.left + 20, archCenterY);
  context.arc(archCenterX, archCenterY, stage.archRadius - 20, Math.PI, Math.PI * 2);
  context.lineTo(stage.left + stage.width - 20, stage.top + stage.height - 20);
  context.closePath();
  context.strokeStyle = rgbToRgba(palette.goldMid, 0.4);
  context.lineWidth = 1;
  context.stroke();
  context.restore();

  drawSteppedCrownV5(context, palette, archCenterX, stage.top - 8);
  return stage;
}

/**
 * Рисует чешуйчатый пол из полукруглых «вееров» под аркой.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @returns {void}
 */
function drawScalloppedFloorV5(context, palette) {
  const floorTop = CARD_HEIGHT - 218;
  const scallopRadius = 62;
  context.save();
  context.beginPath();
  context.rect(76, floorTop - scallopRadius, CARD_WIDTH - 152, CARD_HEIGHT - floorTop + scallopRadius - 76);
  context.clip();
  // Инвариант цикла: каждый следующий ряд смещён на полрадиуса —
  // чешуя перекрывается как черепица.
  for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
    const rowY = floorTop + rowIndex * scallopRadius * 0.72;
    const rowOffset = rowIndex % 2 === 0 ? 0 : scallopRadius;
    const rowAlpha = 0.34 - rowIndex * 0.07;
    for (let scallopX = -scallopRadius; scallopX < CARD_WIDTH + scallopRadius; scallopX += scallopRadius * 2) {
      context.strokeStyle = rgbToRgba(palette.goldMid, rowAlpha);
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(scallopX + rowOffset, rowY, scallopRadius, Math.PI, Math.PI * 2);
      context.stroke();
    }
  }
  context.restore();
}

/**
 * Рассыпает мерцающие золотые искры-ромбики по полю карты.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawGoldSparklesV5(context, palette, seededRandom) {
  context.save();
  for (let sparkleIndex = 0; sparkleIndex < 64; sparkleIndex++) {
    const sparkleX = seededRangeV5(seededRandom, 60, CARD_WIDTH - 60);
    const sparkleY = seededRangeV5(seededRandom, 60, CARD_HEIGHT - 60);
    const sparkleSize = seededRangeV5(seededRandom, 1.6, 4.6);
    const sparkleAlpha = seededRangeV5(seededRandom, 0.16, 0.7);
    context.fillStyle = rgbToRgba(sparkleIndex % 3 === 0 ? palette.goldLight : palette.goldMid, sparkleAlpha);
    traceDiamondV5(context, sparkleX, sparkleY, sparkleSize, sparkleSize * 1.9);
    context.fill();
  }
  context.restore();
}

/**
 * Рисует стилизованный пальмовый лист ар-деко (для botanical-макета).
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {number} originX
 * @param {number} originY
 * @param {number} direction — 1 или -1, зеркалирование по X
 * @returns {void}
 */
function drawDecoPalmV5(context, palette, originX, originY, direction) {
  assert(direction === 1 || direction === -1, `Expected direction 1|-1, got ${direction}`);
  context.save();
  context.translate(originX, originY);
  context.scale(direction, 1);
  for (let frondIndex = 0; frondIndex < 5; frondIndex++) {
    const frondAngle = -Math.PI / 2.2 + frondIndex * 0.19;
    const frondLength = 190 - Math.abs(frondIndex - 2) * 34;
    context.strokeStyle = rgbToRgba(palette.goldMid, 0.62);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.quadraticCurveTo(
      Math.cos(frondAngle) * frondLength * 0.5 + 26,
      Math.sin(frondAngle) * frondLength * 0.5,
      Math.cos(frondAngle) * frondLength + 12,
      Math.sin(frondAngle) * frondLength,
    );
    context.stroke();
    context.fillStyle = rgbToRgba(palette.goldLight, 0.85);
    traceDiamondV5(
      context,
      Math.cos(frondAngle) * frondLength + 12,
      Math.sin(frondAngle) * frondLength,
      4, 7,
    );
    context.fill();
  }
  context.restore();
}

/**
 * Рисует горизонтальную орденскую ленту с шевронами (для ribbon-макета).
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {number} bandCenterY
 * @returns {void}
 */
function drawChevronBandV5(context, palette, bandCenterY) {
  const bandHalfHeight = 30;
  context.save();
  context.fillStyle = rgbToRgba(palette.goldDeep, 0.24);
  context.fillRect(0, bandCenterY - bandHalfHeight, CARD_WIDTH, bandHalfHeight * 2);
  context.strokeStyle = rgbToRgba(palette.goldMid, 0.6);
  context.lineWidth = 1.4;
  context.beginPath();
  for (let chevronX = 0; chevronX <= CARD_WIDTH; chevronX += 46) {
    context.moveTo(chevronX, bandCenterY - bandHalfHeight + 8);
    context.lineTo(chevronX + 23, bandCenterY);
    context.lineTo(chevronX + 46, bandCenterY - bandHalfHeight + 8);
    context.moveTo(chevronX, bandCenterY + bandHalfHeight - 8);
    context.lineTo(chevronX + 23, bandCenterY);
    context.lineTo(chevronX + 46, bandCenterY + bandHalfHeight - 8);
  }
  context.stroke();
  context.restore();
}

/**
 * Рисует акценты выбранного макета поверх базовой сцены.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @returns {void}
 */
function drawLayoutAccentsV5(context, palette, layout) {
  if (layout === 'corner') {
    drawCornerFanV5(context, palette, 44, 44, 0);
    drawCornerFanV5(context, palette, CARD_WIDTH - 44, CARD_HEIGHT - 44, Math.PI);
  }
  if (layout === 'botanical') {
    drawDecoPalmV5(context, palette, 96, CARD_HEIGHT - 96, 1);
    drawDecoPalmV5(context, palette, CARD_WIDTH - 96, CARD_HEIGHT - 96, -1);
  }
  if (layout === 'ribbon') {
    drawChevronBandV5(context, palette, 174);
    drawChevronBandV5(context, palette, CARD_HEIGHT - 174);
  }
  if (layout === 'classic' || layout === 'minimal') {
    drawScalloppedFloorV5(context, palette);
  }
}

/**
 * Подбирает строки и размер основного текста внутри арочной сцены.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @returns {{lines: string[], fontSize: number, lineHeight: number}}
 */
function layoutStageTextV5(context, wishText, fontStyle) {
  let fontSize = fontStyle === 'script' ? 108 : 82;
  let lines = [];
  let lineHeight = 0;

  // Инвариант цикла: fontSize монотонно убывает, пока блок не влезет по высоте.
  for (let layoutAttempt = 0; layoutAttempt < 10; layoutAttempt++) {
    context.font = getMainFont(fontStyle, fontSize);
    lines = wrapTextLines(context, wishText, 640);
    lineHeight = fontSize * (fontStyle === 'script' ? 1.1 : 1.26);
    if (lines.length * lineHeight <= 430) {
      break;
    }
    fontSize -= 6;
  }
  assert(fontSize >= 30, `Expected readable font size >= 30, got ${fontSize}`);
  return { lines, fontSize, lineHeight };
}

/**
 * Рисует надзаголовок, основной текст, золотой разделитель и подпись.
 * @param {CanvasRenderingContext2D} context
 * @param {DecoPaletteV5} palette
 * @param {string} wishText
 * @param {string} signatureText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @returns {void}
 */
function drawTypographyV5(context, palette, wishText, signatureText, fontStyle) {
  const textLayout = layoutStageTextV5(context, wishText, fontStyle);
  const textBlockHeight = textLayout.lines.length * textLayout.lineHeight;
  const textBlockCenterY = 742;
  const firstLineY = textBlockCenterY - textBlockHeight / 2 + textLayout.lineHeight / 2;
  const containsCyrillic = /[А-Яа-яЁё]/.test(wishText);

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.font = '600 21px "Montserrat", sans-serif';
  context.letterSpacing = '7px';
  context.fillStyle = rgbToRgba(palette.goldLight, 0.92);
  const eyebrowText = containsCyrillic ? '◆ С НАИЛУЧШИМИ ◆' : '◆ WITH BEST WISHES ◆';
  context.fillText(eyebrowText, CARD_WIDTH / 2, 428);
  context.letterSpacing = '0px';

  for (let lineIndex = 0; lineIndex < textLayout.lines.length; lineIndex++) {
    const lineY = firstLineY + lineIndex * textLayout.lineHeight;
    if (fontStyle === 'mixed' && lineIndex === 0) {
      context.font = `italic ${textLayout.fontSize + 4}px "Playfair Display", Georgia, serif`;
    } else {
      context.font = getMainFont(fontStyle, textLayout.fontSize);
    }
    context.shadowColor = 'rgba(0, 0, 0, 0.55)';
    context.shadowBlur = 14;
    context.shadowOffsetY = 3;
    context.fillStyle = palette.text;
    context.fillText(textLayout.lines[lineIndex], CARD_WIDTH / 2, lineY);
  }
  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  const dividerY = 1000;
  const dividerHalfSpan = 210;
  const dividerGradient = context.createLinearGradient(
    CARD_WIDTH / 2 - dividerHalfSpan, dividerY,
    CARD_WIDTH / 2 + dividerHalfSpan, dividerY,
  );
  dividerGradient.addColorStop(0, rgbToRgba(palette.goldMid, 0));
  dividerGradient.addColorStop(0.5, rgbToRgba(palette.goldLight, 0.9));
  dividerGradient.addColorStop(1, rgbToRgba(palette.goldMid, 0));
  context.strokeStyle = dividerGradient;
  context.lineWidth = 1.6;
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2 - dividerHalfSpan, dividerY);
  context.lineTo(CARD_WIDTH / 2 + dividerHalfSpan, dividerY);
  context.stroke();
  context.fillStyle = palette.goldLight;
  traceDiamondV5(context, CARD_WIDTH / 2, dividerY, 9, 5.5);
  context.fill();

  context.font = '46px "Caveat", cursive';
  context.fillStyle = rgbToRgba(palette.text, 0.85);
  context.fillText(signatureText, CARD_WIDTH / 2, 1046);

  context.font = '500 15px "Montserrat", sans-serif';
  context.letterSpacing = '4px';
  context.fillStyle = rgbToRgba(palette.goldMid, 0.65);
  context.fillText('· MMXXVI ·', CARD_WIDTH / 2, CARD_HEIGHT - 92);
  context.letterSpacing = '0px';
  context.restore();
}

/**
 * Генерирует открытку v5.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5', postProcessSeed: number} | null} [cardState]
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5', postProcessSeed: number, exportBackgroundColor: string}}}
 */
export function generateGreetingCardV5(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v5);
  assert(typeof state.text === 'string' && state.text.trim().length > 0, `Expected non-empty wish text, got "${state.text}"`);
  assert(typeof state.signature === 'string', `Expected signature string, got ${typeof state.signature}`);
  const postProcessSeed = state.postProcessSeed ?? Math.random() * 10000;
  const seededRandom = createSeededRandomV5(postProcessSeed);
  const palette = createDecoPaletteV5(getPaletteForCategory(state.category));
  const canvas = getRenderCanvas();
  const context = getRenderContext();

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  fillOpaqueCanvasBase(context, V5_INK_COLOR);
  drawVelvetBackgroundV5(context, palette);
  drawSunburstV5(context, palette, seededRandom);
  drawGoldSparklesV5(context, palette, seededRandom);
  drawLayoutAccentsV5(context, palette, state.layout);
  drawArchStageV5(context, palette);
  drawDecoFrameV5(context, palette);
  drawTypographyV5(context, palette, state.text, state.signature, state.fontStyle);

  const opaqueCanvas = flattenCanvasToOpaque(canvas, V5_INK_COLOR);
  return {
    canvas: opaqueCanvas,
    cardState: {
      ...state,
      rendererVersion: CARD_RENDERER_VERSIONS.v5,
      postProcessSeed,
      exportBackgroundColor: V5_INK_COLOR,
    },
  };
}
