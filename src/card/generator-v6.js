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
 * Рендер открыток v6 — «Витражный сад · свет сквозь стекло»:
 * роза-окно, свинцовые перемычки, ювелирные стёкла,
 * ботанические силуэты и матовая стеклянная сцена для текста.
 */

const V6_LEAD_COLOR = '#2A2218';
const V6_INK_COLOR = '#0A0810';
const V6_TEXT_COLOR = '#FFF8EE';
const V6_HIGHLIGHT = '#FFF1C2';
const V6_COPPER = '#C4A06A';

/**
 * Создаёт воспроизводимый генератор чисел для одного состояния открытки.
 * @param {number} seed
 * @returns {() => number}
 */
function createSeededRandomV6(seed) {
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
function seededRangeV6(seededRandom, minimum, maximum) {
  assert(maximum > minimum, `Expected maximum > minimum, got ${maximum} <= ${minimum}`);
  return minimum + seededRandom() * (maximum - minimum);
}

/**
 * @typedef {{
 *   nightSky: string,
 *   nightDeep: string,
 *   glassWarm: string,
 *   glassCool: string,
 *   glassAccent: string,
 *   glassLeaf: string,
 *   glassPetal: string,
 *   lead: string,
 *   highlight: string,
 *   panel: string,
 *   text: string,
 * }} GlassPaletteV6
 */

/**
 * Строит ювелирную витражную палитру из палитры категории.
 * @param {{background: string[], accent: string, text: string, textShadow: string, decor: string}} sourcePalette
 * @returns {GlassPaletteV6}
 */
function createGlassPaletteV6(sourcePalette) {
  const nightBase = blendColors(sourcePalette.text, V6_INK_COLOR, 0.82);
  return {
    nightSky: blendColors(nightBase, sourcePalette.accent, 0.28),
    nightDeep: blendColors(nightBase, '#050308', 0.5),
    glassWarm: blendColors(sourcePalette.background[0], '#FFD86A', 0.55),
    glassCool: blendColors(sourcePalette.decor, '#5EB8FF', 0.62),
    glassAccent: blendColors(sourcePalette.accent, '#FF5A7A', 0.42),
    glassLeaf: blendColors(sourcePalette.decor, '#2FBF7A', 0.58),
    glassPetal: blendColors(sourcePalette.accent, '#FF8EC0', 0.52),
    lead: blendColors(V6_LEAD_COLOR, V6_COPPER, 0.35),
    highlight: blendColors(V6_HIGHLIGHT, sourcePalette.background[0], 0.18),
    panel: blendColors(nightBase, '#FFFFFF', 0.1),
    text: V6_TEXT_COLOR,
  };
}

/**
 * Возвращает набор цветов стёкол для ячеек витража.
 * @param {GlassPaletteV6} palette
 * @returns {string[]}
 */
function glassColorPoolV6(palette) {
  return [
    palette.glassWarm,
    palette.glassCool,
    palette.glassAccent,
    palette.glassLeaf,
    palette.glassPetal,
    blendColors(palette.glassWarm, palette.glassCool, 0.5),
    blendColors(palette.glassAccent, palette.highlight, 0.35),
  ];
}

/**
 * Рисует глубокий ночной фон с тёплым свечением «за стеклом».
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @returns {void}
 */
function drawNightSkyV6(context, palette) {
  const skyGradient = context.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  skyGradient.addColorStop(0, palette.nightSky);
  skyGradient.addColorStop(0.45, blendColors(palette.nightSky, palette.nightDeep, 0.4));
  skyGradient.addColorStop(1, palette.nightDeep);
  context.fillStyle = skyGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const bloomGradient = context.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT * 0.28, 40,
    CARD_WIDTH / 2, CARD_HEIGHT * 0.28, CARD_HEIGHT * 0.7,
  );
  bloomGradient.addColorStop(0, rgbToRgba(palette.highlight, 0.34));
  bloomGradient.addColorStop(0.35, rgbToRgba(palette.glassWarm, 0.16));
  bloomGradient.addColorStop(0.7, rgbToRgba(palette.glassCool, 0.06));
  bloomGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = bloomGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Рисует диагональные каустики — блики света, прошедшего сквозь стекло.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawCausticBeamsV6(context, palette, seededRandom) {
  context.save();
  for (let beamIndex = 0; beamIndex < 7; beamIndex++) {
    const beamOriginX = seededRangeV6(seededRandom, CARD_WIDTH * 0.15, CARD_WIDTH * 0.85);
    const beamAngle = seededRangeV6(seededRandom, 0.35, 1.15);
    const beamLength = seededRangeV6(seededRandom, 520, 980);
    const beamWidth = seededRangeV6(seededRandom, 28, 72);
    const beamAlpha = seededRangeV6(seededRandom, 0.08, 0.18);
    const tipX = beamOriginX + Math.cos(beamAngle) * beamLength;
    const tipY = CARD_HEIGHT * 0.12 + Math.sin(beamAngle) * beamLength;
    const beamGradient = context.createLinearGradient(beamOriginX, CARD_HEIGHT * 0.12, tipX, tipY);
    beamGradient.addColorStop(0, rgbToRgba(palette.highlight, beamAlpha));
    beamGradient.addColorStop(0.55, rgbToRgba(palette.glassWarm, beamAlpha * 0.55));
    beamGradient.addColorStop(1, rgbToRgba(palette.glassCool, 0));
    context.fillStyle = beamGradient;
    context.beginPath();
    context.moveTo(beamOriginX - beamWidth / 2, CARD_HEIGHT * 0.12);
    context.lineTo(beamOriginX + beamWidth / 2, CARD_HEIGHT * 0.12);
    context.lineTo(tipX + beamWidth * 0.15, tipY);
    context.lineTo(tipX - beamWidth * 0.15, tipY);
    context.closePath();
    context.fill();
  }
  context.restore();
}

/**
 * Рисует сектор розы-окна (один «лепесток» витража).
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} innerRadius
 * @param {number} outerRadius
 * @param {number} startAngle
 * @param {number} endAngle
 * @returns {void}
 */
function fillRosePetalV6(context, centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
  assert(outerRadius > innerRadius, `Expected outer > inner radius, got ${outerRadius} <= ${innerRadius}`);
  context.beginPath();
  context.arc(centerX, centerY, outerRadius, startAngle, endAngle);
  context.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
  context.closePath();
  context.fill();
  context.stroke();
}

/**
 * Рисует большое роза-окно в верхней части открытки.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {() => number} seededRandom
 * @returns {{centerX: number, centerY: number, radius: number}}
 */
function drawRoseWindowV6(context, palette, seededRandom) {
  const centerX = CARD_WIDTH / 2;
  const centerY = CARD_HEIGHT * 0.265;
  const outerRadius = 268;
  const glassColors = glassColorPoolV6(palette);
  const petalCount = 16;

  context.save();
  context.lineJoin = 'round';
  context.strokeStyle = palette.lead;
  context.lineWidth = 3.2;

  // Инвариант: после petalIndex нарисованы лепестки 0..petalIndex внешнего кольца.
  for (let petalIndex = 0; petalIndex < petalCount; petalIndex++) {
    const startAngle = (petalIndex / petalCount) * Math.PI * 2 - Math.PI / 2;
    const endAngle = ((petalIndex + 1) / petalCount) * Math.PI * 2 - Math.PI / 2;
    const glassColor = glassColors[petalIndex % glassColors.length];
    const petalGradient = context.createRadialGradient(
      centerX, centerY, outerRadius * 0.35,
      centerX, centerY, outerRadius,
    );
    petalGradient.addColorStop(0, rgbToRgba(palette.highlight, 0.78));
    petalGradient.addColorStop(0.4, rgbToRgba(glassColor, 0.88));
    petalGradient.addColorStop(1, rgbToRgba(blendColors(glassColor, palette.nightDeep, 0.22), 0.92));
    context.fillStyle = petalGradient;
    fillRosePetalV6(context, centerX, centerY, outerRadius * 0.42, outerRadius, startAngle, endAngle);
  }

  const midRingCount = 12;
  for (let midIndex = 0; midIndex < midRingCount; midIndex++) {
    const startAngle = (midIndex / midRingCount) * Math.PI * 2 + seededRangeV6(seededRandom, 0, 0.08);
    const endAngle = ((midIndex + 1) / midRingCount) * Math.PI * 2 + seededRangeV6(seededRandom, 0, 0.08);
    context.fillStyle = rgbToRgba(glassColors[(midIndex + 3) % glassColors.length], 0.9);
    fillRosePetalV6(context, centerX, centerY, outerRadius * 0.18, outerRadius * 0.42, startAngle, endAngle);
  }

  const coreGradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius * 0.2);
  coreGradient.addColorStop(0, rgbToRgba(palette.highlight, 0.95));
  coreGradient.addColorStop(0.55, rgbToRgba(palette.glassWarm, 0.8));
  coreGradient.addColorStop(1, rgbToRgba(palette.glassAccent, 0.7));
  context.fillStyle = coreGradient;
  context.beginPath();
  context.arc(centerX, centerY, outerRadius * 0.18, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.lineWidth = 5;
  context.beginPath();
  context.arc(centerX, centerY, outerRadius + 4, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 2;
  context.beginPath();
  context.arc(centerX, centerY, outerRadius + 14, 0, Math.PI * 2);
  context.stroke();

  // Световой ореол вокруг розы.
  const haloGradient = context.createRadialGradient(
    centerX, centerY, outerRadius,
    centerX, centerY, outerRadius + 90,
  );
  haloGradient.addColorStop(0, rgbToRgba(palette.highlight, 0.18));
  haloGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = haloGradient;
  context.beginPath();
  context.arc(centerX, centerY, outerRadius + 90, 0, Math.PI * 2);
  context.fill();
  context.restore();

  return { centerX, centerY, radius: outerRadius };
}

/**
 * Рисует боковую колонну из прямоугольных витражных ячеек.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {() => number} seededRandom
 * @param {number} columnLeft
 * @returns {void}
 */
function drawGlassColumnV6(context, palette, seededRandom, columnLeft) {
  const columnWidth = 92;
  const cellHeight = 78;
  const glassColors = glassColorPoolV6(palette);
  const columnTop = 118;
  const columnBottom = CARD_HEIGHT - 118;

  context.save();
  context.strokeStyle = palette.lead;
  context.lineWidth = 2.6;
  // Инвариант: ячейки идут сверху вниз без перекрытия, каждая следующего цвета пула.
  for (let cellTop = columnTop, cellIndex = 0; cellTop + cellHeight <= columnBottom; cellTop += cellHeight, cellIndex++) {
    const glassColor = glassColors[cellIndex % glassColors.length];
    const cellGradient = context.createLinearGradient(columnLeft, cellTop, columnLeft + columnWidth, cellTop + cellHeight);
    cellGradient.addColorStop(0, rgbToRgba(blendColors(glassColor, palette.highlight, 0.35), 0.88));
    cellGradient.addColorStop(0.5, rgbToRgba(glassColor, 0.8));
    cellGradient.addColorStop(1, rgbToRgba(blendColors(glassColor, palette.nightDeep, 0.22), 0.86));
    context.fillStyle = cellGradient;
    context.fillRect(columnLeft, cellTop, columnWidth, cellHeight);
    context.strokeRect(columnLeft, cellTop, columnWidth, cellHeight);

    if (seededRandom() > 0.45) {
      context.strokeStyle = rgbToRgba(palette.highlight, 0.35);
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(columnLeft + 12, cellTop + cellHeight * 0.55);
      context.quadraticCurveTo(
        columnLeft + columnWidth / 2,
        cellTop + 8,
        columnLeft + columnWidth - 12,
        cellTop + cellHeight * 0.55,
      );
      context.stroke();
      context.strokeStyle = palette.lead;
      context.lineWidth = 2.6;
    }
  }
  context.restore();
}

/**
 * Рисует лист папоротника как силуэт на стекле.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {number} originX
 * @param {number} originY
 * @param {number} direction — 1 или -1
 * @param {number} scale
 * @returns {void}
 */
function drawFernSilhouetteV6(context, palette, originX, originY, direction, scale) {
  assert(direction === 1 || direction === -1, `Expected direction 1|-1, got ${direction}`);
  assert(scale > 0, `Expected positive scale, got ${scale}`);
  context.save();
  context.translate(originX, originY);
  context.scale(direction * scale, scale);
  context.strokeStyle = rgbToRgba(palette.glassLeaf, 0.95);
  context.fillStyle = rgbToRgba(palette.glassLeaf, 0.42);
  context.lineWidth = 2.4;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(0, 0);
  context.quadraticCurveTo(18, -120, 8, -260);
  context.stroke();
  // Инвариант: frondIndex растёт вниз по стеблю, листочки зеркальны по сторонам.
  for (let frondIndex = 0; frondIndex < 11; frondIndex++) {
    const stemT = frondIndex / 10;
    const stemY = -20 - stemT * 230;
    const stemX = 4 + Math.sin(stemT * Math.PI) * 6;
    const leafletLength = 42 - stemT * 28;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(stemX, stemY);
      context.quadraticCurveTo(
        stemX + side * leafletLength * 0.7,
        stemY - 18,
        stemX + side * leafletLength,
        stemY + 6,
      );
      context.quadraticCurveTo(
        stemX + side * leafletLength * 0.45,
        stemY + 10,
        stemX,
        stemY,
      );
      context.fill();
      context.stroke();
    }
  }
  context.restore();
}

/**
 * Рисует стилизованный пион / розу из лепестковых дуг.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} bloomRadius
 * @returns {void}
 */
function drawPeonyBloomV6(context, palette, centerX, centerY, bloomRadius) {
  assert(bloomRadius > 0, `Expected positive bloomRadius, got ${bloomRadius}`);
  context.save();
  const petalLayers = [
    { count: 8, radius: bloomRadius, alpha: 0.22 },
    { count: 7, radius: bloomRadius * 0.72, alpha: 0.34 },
    { count: 6, radius: bloomRadius * 0.46, alpha: 0.48 },
  ];
  for (const layer of petalLayers) {
    for (let petalIndex = 0; petalIndex < layer.count; petalIndex++) {
      const petalAngle = (petalIndex / layer.count) * Math.PI * 2 + layer.radius * 0.01;
      const petalX = centerX + Math.cos(petalAngle) * layer.radius * 0.28;
      const petalY = centerY + Math.sin(petalAngle) * layer.radius * 0.28;
      context.fillStyle = rgbToRgba(palette.glassPetal, Math.min(0.72, layer.alpha + 0.18));
      context.strokeStyle = rgbToRgba(palette.lead, 0.55);
      context.lineWidth = 1.4;
      context.beginPath();
      context.ellipse(petalX, petalY, layer.radius * 0.38, layer.radius * 0.22, petalAngle, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }
  context.fillStyle = rgbToRgba(palette.glassWarm, 0.85);
  context.beginPath();
  context.arc(centerX, centerY, bloomRadius * 0.12, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * Рисует матовую стеклянную панель для текста с фацетом.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @returns {{left: number, top: number, width: number, height: number}}
 */
function drawFrostedPanelV6(context, palette) {
  const panel = { left: 168, top: 560, width: 744, height: 560 };
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.4)';
  context.shadowBlur = 36;
  context.shadowOffsetY = 12;

  const panelGradient = context.createLinearGradient(0, panel.top, 0, panel.top + panel.height);
  panelGradient.addColorStop(0, rgbToRgba(blendColors(palette.panel, palette.highlight, 0.12), 0.88));
  panelGradient.addColorStop(0.45, rgbToRgba(palette.panel, 0.82));
  panelGradient.addColorStop(1, rgbToRgba(blendColors(palette.panel, palette.nightDeep, 0.25), 0.9));
  context.fillStyle = panelGradient;
  roundRectPathV6(context, panel.left, panel.top, panel.width, panel.height, 28);
  context.fill();

  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  // Фацетная рамка — двойной контур «свинца».
  context.strokeStyle = palette.lead;
  context.lineWidth = 4;
  roundRectPathV6(context, panel.left, panel.top, panel.width, panel.height, 28);
  context.stroke();
  context.strokeStyle = rgbToRgba(palette.highlight, 0.35);
  context.lineWidth = 1.5;
  roundRectPathV6(context, panel.left + 12, panel.top + 12, panel.width - 24, panel.height - 24, 20);
  context.stroke();

  // Блик по верхнему краю матового стекла.
  const sheenGradient = context.createLinearGradient(0, panel.top, 0, panel.top + 90);
  sheenGradient.addColorStop(0, rgbToRgba(palette.highlight, 0.22));
  sheenGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = sheenGradient;
  roundRectPathV6(context, panel.left + 4, panel.top + 4, panel.width - 8, 80, 24);
  context.fill();
  context.restore();
  return panel;
}

/**
 * Строит path скруглённого прямоугольника.
 * @param {CanvasRenderingContext2D} context
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @returns {void}
 */
function roundRectPathV6(context, left, top, width, height, radius) {
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
 * Рассыпает искорки на пересечениях свинцовых линий.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawGlassSparklesV6(context, palette, seededRandom) {
  context.save();
  for (let sparkleIndex = 0; sparkleIndex < 52; sparkleIndex++) {
    const sparkleX = seededRangeV6(seededRandom, 50, CARD_WIDTH - 50);
    const sparkleY = seededRangeV6(seededRandom, 50, CARD_HEIGHT - 50);
    const sparkleSize = seededRangeV6(seededRandom, 1.2, 3.8);
    const sparkleAlpha = seededRangeV6(seededRandom, 0.2, 0.75);
    context.fillStyle = rgbToRgba(
      sparkleIndex % 4 === 0 ? palette.highlight : palette.glassWarm,
      sparkleAlpha,
    );
    context.beginPath();
    context.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
    context.fill();
    if (sparkleIndex % 5 === 0) {
      context.strokeStyle = rgbToRgba(palette.highlight, sparkleAlpha * 0.8);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(sparkleX - sparkleSize * 2.4, sparkleY);
      context.lineTo(sparkleX + sparkleSize * 2.4, sparkleY);
      context.moveTo(sparkleX, sparkleY - sparkleSize * 2.4);
      context.lineTo(sparkleX, sparkleY + sparkleSize * 2.4);
      context.stroke();
    }
  }
  context.restore();
}

/**
 * Рисует горизонтальную ленту из цветных стёкол.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {number} bandTop
 * @returns {void}
 */
function drawGlassRibbonV6(context, palette, bandTop) {
  const bandHeight = 54;
  const cellWidth = 72;
  const glassColors = glassColorPoolV6(palette);
  context.save();
  context.strokeStyle = palette.lead;
  context.lineWidth = 2.4;
  for (let cellIndex = 0, cellLeft = 72; cellLeft + cellWidth <= CARD_WIDTH - 72; cellLeft += cellWidth, cellIndex++) {
    context.fillStyle = rgbToRgba(glassColors[cellIndex % glassColors.length], 0.86);
    context.fillRect(cellLeft, bandTop, cellWidth, bandHeight);
    context.strokeRect(cellLeft, bandTop, cellWidth, bandHeight);
  }
  context.restore();
}

/**
 * Рисует угловой медальон-розу (уменьшенное окно).
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {number} centerX
 * @param {number} centerY
 * @returns {void}
 */
function drawCornerMedallionV6(context, palette, centerX, centerY) {
  const radius = 88;
  const glassColors = glassColorPoolV6(palette);
  context.save();
  context.strokeStyle = palette.lead;
  context.lineWidth = 2.2;
  for (let petalIndex = 0; petalIndex < 10; petalIndex++) {
    const startAngle = (petalIndex / 10) * Math.PI * 2;
    const endAngle = ((petalIndex + 1) / 10) * Math.PI * 2;
    context.fillStyle = rgbToRgba(glassColors[petalIndex % glassColors.length], 0.88);
    fillRosePetalV6(context, centerX, centerY, radius * 0.28, radius, startAngle, endAngle);
  }
  context.fillStyle = rgbToRgba(palette.highlight, 0.85);
  context.beginPath();
  context.arc(centerX, centerY, radius * 0.28, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

/**
 * Рисует внешнюю свинцовую рамку открытки.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @returns {void}
 */
function drawLeadFrameV6(context, palette) {
  context.save();
  context.strokeStyle = palette.lead;
  context.lineWidth = 18;
  context.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);
  context.lineWidth = 3;
  context.strokeStyle = rgbToRgba(palette.highlight, 0.25);
  context.strokeRect(44, 44, CARD_WIDTH - 88, CARD_HEIGHT - 88);
  context.restore();
}

/**
 * Рисует акценты выбранного макета.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @param {() => number} seededRandom
 * @returns {void}
 */
function drawLayoutAccentsV6(context, palette, layout, seededRandom) {
  if (layout === 'classic' || layout === 'minimal') {
    drawGlassColumnV6(context, palette, seededRandom, 48);
    drawGlassColumnV6(context, palette, seededRandom, CARD_WIDTH - 140);
  }
  if (layout === 'corner') {
    drawCornerMedallionV6(context, palette, 118, 118);
    drawCornerMedallionV6(context, palette, CARD_WIDTH - 118, CARD_HEIGHT - 118);
    drawCornerMedallionV6(context, palette, CARD_WIDTH - 118, 118);
    drawCornerMedallionV6(context, palette, 118, CARD_HEIGHT - 118);
  }
  if (layout === 'ribbon') {
    drawGlassRibbonV6(context, palette, 96);
    drawGlassRibbonV6(context, palette, CARD_HEIGHT - 150);
  }
  if (layout === 'botanical' || layout === 'classic') {
    drawFernSilhouetteV6(context, palette, 150, CARD_HEIGHT - 160, 1, 1.05);
    drawFernSilhouetteV6(context, palette, CARD_WIDTH - 150, CARD_HEIGHT - 160, -1, 1.05);
    drawPeonyBloomV6(context, palette, 220, 1180, 70);
    drawPeonyBloomV6(context, palette, CARD_WIDTH - 220, 1180, 70);
  }
  if (layout === 'botanical') {
    drawPeonyBloomV6(context, palette, 200, 420, 58);
    drawPeonyBloomV6(context, palette, CARD_WIDTH - 200, 420, 58);
    drawFernSilhouetteV6(context, palette, 130, 520, 1, 0.72);
    drawFernSilhouetteV6(context, palette, CARD_WIDTH - 130, 520, -1, 0.72);
  }
}

/**
 * Подбирает строки и размер текста внутри матовой панели.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @returns {{lines: string[], fontSize: number, lineHeight: number}}
 */
function layoutPanelTextV6(context, wishText, fontStyle) {
  let fontSize = fontStyle === 'script' ? 104 : 80;
  let lines = [];
  let lineHeight = 0;

  // Инвариант: fontSize монотонно убывает, пока блок не влезет по высоте панели.
  for (let layoutAttempt = 0; layoutAttempt < 10; layoutAttempt++) {
    context.font = getMainFont(fontStyle, fontSize);
    lines = wrapTextLines(context, wishText, 620);
    lineHeight = fontSize * (fontStyle === 'script' ? 1.1 : 1.26);
    if (lines.length * lineHeight <= 360) {
      break;
    }
    fontSize -= 6;
  }
  assert(fontSize >= 30, `Expected readable font size >= 30, got ${fontSize}`);
  return { lines, fontSize, lineHeight };
}

/**
 * Рисует типографику на матовой панели.
 * @param {CanvasRenderingContext2D} context
 * @param {GlassPaletteV6} palette
 * @param {string} wishText
 * @param {string} signatureText
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @returns {void}
 */
function drawTypographyV6(context, palette, wishText, signatureText, fontStyle) {
  const textLayout = layoutPanelTextV6(context, wishText, fontStyle);
  const textBlockHeight = textLayout.lines.length * textLayout.lineHeight;
  const textBlockCenterY = 790;
  const firstLineY = textBlockCenterY - textBlockHeight / 2 + textLayout.lineHeight / 2;
  const containsCyrillic = /[А-Яа-яЁё]/.test(wishText);

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.font = '600 20px "Montserrat", sans-serif';
  context.letterSpacing = '6px';
  context.fillStyle = rgbToRgba(palette.highlight, 0.88);
  const eyebrowText = containsCyrillic ? '✦ СВЕТ И ТЕПЛО ✦' : '✦ LIGHT & WARMTH ✦';
  context.fillText(eyebrowText, CARD_WIDTH / 2, 610);
  context.letterSpacing = '0px';

  for (let lineIndex = 0; lineIndex < textLayout.lines.length; lineIndex++) {
    const lineY = firstLineY + lineIndex * textLayout.lineHeight;
    if (fontStyle === 'mixed' && lineIndex === 0) {
      context.font = `italic ${textLayout.fontSize + 4}px "Playfair Display", Georgia, serif`;
    } else {
      context.font = getMainFont(fontStyle, textLayout.fontSize);
    }
    context.shadowColor = 'rgba(0, 0, 0, 0.45)';
    context.shadowBlur = 12;
    context.shadowOffsetY = 2;
    context.fillStyle = palette.text;
    context.fillText(textLayout.lines[lineIndex], CARD_WIDTH / 2, lineY);
  }
  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  const dividerY = 1008;
  const dividerHalfSpan = 200;
  const dividerGradient = context.createLinearGradient(
    CARD_WIDTH / 2 - dividerHalfSpan, dividerY,
    CARD_WIDTH / 2 + dividerHalfSpan, dividerY,
  );
  dividerGradient.addColorStop(0, rgbToRgba(palette.glassCool, 0));
  dividerGradient.addColorStop(0.5, rgbToRgba(palette.highlight, 0.85));
  dividerGradient.addColorStop(1, rgbToRgba(palette.glassWarm, 0));
  context.strokeStyle = dividerGradient;
  context.lineWidth = 1.6;
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2 - dividerHalfSpan, dividerY);
  context.lineTo(CARD_WIDTH / 2 + dividerHalfSpan, dividerY);
  context.stroke();

  context.fillStyle = rgbToRgba(palette.highlight, 0.9);
  context.beginPath();
  context.arc(CARD_WIDTH / 2, dividerY, 4.5, 0, Math.PI * 2);
  context.fill();

  context.font = '46px "Caveat", cursive';
  context.fillStyle = rgbToRgba(palette.text, 0.88);
  context.fillText(signatureText, CARD_WIDTH / 2, 1058);

  context.font = '500 14px "Montserrat", sans-serif';
  context.letterSpacing = '5px';
  context.fillStyle = rgbToRgba(palette.highlight, 0.55);
  context.fillText('· VITRAIL ·', CARD_WIDTH / 2, CARD_HEIGHT - 78);
  context.letterSpacing = '0px';
  context.restore();
}

/**
 * Генерирует открытку v6.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6', postProcessSeed: number} | null} [cardState]
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6', postProcessSeed: number, exportBackgroundColor: string}}}
 */
export function generateGreetingCardV6(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v6);
  assert(typeof state.text === 'string' && state.text.trim().length > 0, `Expected non-empty wish text, got "${state.text}"`);
  assert(typeof state.signature === 'string', `Expected signature string, got ${typeof state.signature}`);
  const postProcessSeed = state.postProcessSeed ?? Math.random() * 10000;
  const seededRandom = createSeededRandomV6(postProcessSeed);
  const palette = createGlassPaletteV6(getPaletteForCategory(state.category));
  const canvas = getRenderCanvas();
  const context = getRenderContext();

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  fillOpaqueCanvasBase(context, V6_INK_COLOR);
  drawNightSkyV6(context, palette);
  drawCausticBeamsV6(context, palette, seededRandom);
  drawRoseWindowV6(context, palette, seededRandom);
  drawLayoutAccentsV6(context, palette, state.layout, seededRandom);
  drawGlassSparklesV6(context, palette, seededRandom);
  drawFrostedPanelV6(context, palette);
  drawLeadFrameV6(context, palette);
  drawTypographyV6(context, palette, state.text, state.signature, state.fontStyle);

  const opaqueCanvas = flattenCanvasToOpaque(canvas, V6_INK_COLOR);
  return {
    canvas: opaqueCanvas,
    cardState: {
      ...state,
      rendererVersion: CARD_RENDERER_VERSIONS.v6,
      postProcessSeed,
      exportBackgroundColor: V6_INK_COLOR,
    },
  };
}
