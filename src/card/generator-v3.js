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
} from './generator-shared.js';
import { getPaletteForCategory } from './themes.js';

/**
 * Рендер открыток v3 — праздничный премиальный стиль:
 * мягкое свечение, боке, орнаментальная рамка, конфетти и изящный текст.
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
 * Обогащает палитру для v3 — теплее, светлее, с «золотым» акцентом.
 * @param {{background: string[], accent: string, text: string, textShadow: string, decor: string}} palette
 * @returns {{background: string[], accent: string, text: string, textShadow: string, decor: string, foil: string}}
 */
function enrichPaletteForV3(palette) {
  const foil = blendColors(palette.accent, '#D4A84B', 0.45);
  return {
    background: [
      blendColors(palette.background[0], '#FFFFFF', 0.18),
      blendColors(palette.background[1], palette.decor, 0.1),
      blendColors(palette.background[2], palette.accent, 0.12),
    ],
    accent: blendColors(palette.accent, foil, 0.2),
    text: blendColors(palette.text, '#1A1210', 0.18),
    textShadow: 'rgba(40, 24, 16, 0.18)',
    decor: blendColors(palette.decor, foil, 0.22),
    foil,
  };
}

/**
 * Светящийся бумажный фон с лучами и мягким ореолом.
 * @param {CanvasRenderingContext2D} context
 * @param {{background: string[], accent: string, decor: string, foil: string}} palette
 */
function drawLuminousBackgroundV3(context, palette) {
  const baseGradient = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  baseGradient.addColorStop(0, palette.background[0]);
  baseGradient.addColorStop(0.4, palette.background[1]);
  baseGradient.addColorStop(1, palette.background[2]);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glowCenterX = CARD_WIDTH * randomRange(0.35, 0.65);
  const glowCenterY = CARD_HEIGHT * randomRange(0.28, 0.55);
  const centerGlow = context.createRadialGradient(
    glowCenterX,
    glowCenterY,
    0,
    glowCenterX,
    glowCenterY,
    CARD_HEIGHT * randomRange(0.55, 0.75),
  );
  centerGlow.addColorStop(0, rgbToRgba(blendColors(palette.background[0], '#FFFFFF', 0.55), 0.55));
  centerGlow.addColorStop(0.45, rgbToRgba(blendColors(palette.decor, palette.foil, 0.25), 0.14));
  centerGlow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = centerGlow;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawSoftLightRaysV3(context, palette, glowCenterX, glowCenterY);
  drawBokehLightsV3(context, palette);
  drawSilkWashV3(context, palette);
  drawPaperGrainV3(context);
  drawSoftEdgeFadeV3(context);
}

/**
 * Мягкие световые лучи от центра свечения.
 * @param {CanvasRenderingContext2D} context
 * @param {{foil: string, decor: string}} palette
 * @param {number} originX
 * @param {number} originY
 */
function drawSoftLightRaysV3(context, palette, originX, originY) {
  const rayCount = randomInt(5, 8);
  context.save();
  for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
    const rayAngle = (Math.PI * 2 * rayIndex) / rayCount + randomRange(-0.12, 0.12);
    const rayLength = CARD_HEIGHT * randomRange(0.45, 0.85);
    const rayHalfWidth = randomRange(28, 70);
    const tipX = originX + Math.cos(rayAngle) * rayLength;
    const tipY = originY + Math.sin(rayAngle) * rayLength;
    const sideAngle = rayAngle + Math.PI / 2;
    const leftX = originX + Math.cos(sideAngle) * rayHalfWidth * 0.15;
    const leftY = originY + Math.sin(sideAngle) * rayHalfWidth * 0.15;
    const rightX = originX - Math.cos(sideAngle) * rayHalfWidth * 0.15;
    const rightY = originY - Math.sin(sideAngle) * rayHalfWidth * 0.15;
    const tipLeftX = tipX + Math.cos(sideAngle) * rayHalfWidth;
    const tipLeftY = tipY + Math.sin(sideAngle) * rayHalfWidth;
    const tipRightX = tipX - Math.cos(sideAngle) * rayHalfWidth;
    const tipRightY = tipY - Math.sin(sideAngle) * rayHalfWidth;

    const rayGradient = context.createLinearGradient(originX, originY, tipX, tipY);
    rayGradient.addColorStop(0, rgbToRgba(blendColors(palette.foil, '#FFFFFF', 0.5), randomRange(0.08, 0.14)));
    rayGradient.addColorStop(0.55, rgbToRgba(palette.decor, randomRange(0.03, 0.06)));
    rayGradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = rayGradient;
    context.beginPath();
    context.moveTo(leftX, leftY);
    context.lineTo(tipLeftX, tipLeftY);
    context.lineTo(tipRightX, tipRightY);
    context.lineTo(rightX, rightY);
    context.closePath();
    context.fill();
  }
  context.restore();
}

/**
 * Боке — мягкие праздничные огоньки.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string, background: string[]}} palette
 */
function drawBokehLightsV3(context, palette) {
  const bokehCount = randomInt(18, 28);
  for (let bokehIndex = 0; bokehIndex < bokehCount; bokehIndex++) {
    const bokehX = randomRange(40, CARD_WIDTH - 40);
    const bokehY = randomRange(40, CARD_HEIGHT - 40);
    const bokehRadius = randomRange(10, 48);
    const bokehHue = [palette.foil, palette.decor, palette.accent, blendColors(palette.background[0], '#FFFFFF', 0.4)][
      bokehIndex % 4
    ];
    const bokehGradient = createRadialColorGradient(
      context,
      bokehX,
      bokehY,
      0,
      bokehRadius,
      rgbToRgba(blendColors(bokehHue, '#FFFFFF', 0.35), randomRange(0.1, 0.22)),
      'rgba(255,255,255,0)',
    );
    context.fillStyle = bokehGradient;
    context.beginPath();
    context.arc(bokehX, bokehY, bokehRadius, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Шёлковые акварельные разводы.
 * @param {CanvasRenderingContext2D} context
 * @param {{background: string[], decor: string, foil: string}} palette
 */
function drawSilkWashV3(context, palette) {
  const washCount = randomInt(3, 5);
  for (let washIndex = 0; washIndex < washCount; washIndex++) {
    const washX = randomRange(0, CARD_WIDTH);
    const washY = randomRange(0, CARD_HEIGHT);
    const washRadius = randomRange(200, 520);
    const washInner = blendColors(palette.decor, palette.foil, randomRange(0.2, 0.5));
    const washOuter = blendColors(palette.background[washIndex % palette.background.length], '#FFFFFF', 0.2);
    const washGradient = createRadialColorGradient(
      context,
      washX,
      washY,
      0,
      washRadius,
      rgbToRgba(washInner, randomRange(0.08, 0.14)),
      rgbToRgba(washOuter, 0.02),
    );
    context.fillStyle = washGradient;
    context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
}

/**
 * Тонкая зернистость бумаги.
 * @param {CanvasRenderingContext2D} context
 */
function drawPaperGrainV3(context) {
  const imageData = context.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const pixels = imageData.data;
  for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4) {
    const noise = (Math.random() - 0.5) * 10;
    pixels[pixelIndex] = clampByte(pixels[pixelIndex] + noise * 1.05);
    pixels[pixelIndex + 1] = clampByte(pixels[pixelIndex + 1] + noise * 0.9);
    pixels[pixelIndex + 2] = clampByte(pixels[pixelIndex + 2] + noise * 0.85);
  }
  context.putImageData(imageData, 0, 0);
}

/**
 * Мягкое затемнение краёв.
 * @param {CanvasRenderingContext2D} context
 */
function drawSoftEdgeFadeV3(context) {
  const vignette = context.createRadialGradient(
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_HEIGHT * 0.22,
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_HEIGHT * 0.92,
  );
  vignette.addColorStop(0, 'rgba(255,255,255,0)');
  vignette.addColorStop(0.7, 'rgba(0,0,0,0.01)');
  vignette.addColorStop(1, 'rgba(40, 24, 16, 0.08)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * Пятиконечная звезда.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} outerRadius
 * @param {string} fillColor
 * @param {number} rotation
 */
function drawStarV3(context, centerX, centerY, outerRadius, fillColor, rotation) {
  assert(outerRadius > 0, `Expected positive outerRadius, got ${outerRadius}`);
  const innerRadius = outerRadius * 0.42;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.beginPath();
  for (let pointIndex = 0; pointIndex < 10; pointIndex++) {
    const pointRadius = pointIndex % 2 === 0 ? outerRadius : innerRadius;
    const pointAngle = (Math.PI / 5) * pointIndex - Math.PI / 2;
    const pointX = Math.cos(pointAngle) * pointRadius;
    const pointY = Math.sin(pointAngle) * pointRadius;
    if (pointIndex === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  }
  context.closePath();
  context.fillStyle = fillColor;
  context.fill();
  context.restore();
}

/**
 * Мягкое сердечко.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} heartSize
 * @param {string} fillColor
 * @param {number} rotation
 */
function drawHeartV3(context, centerX, centerY, heartSize, fillColor, rotation) {
  assert(heartSize > 0, `Expected positive heartSize, got ${heartSize}`);
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.scale(heartSize / 30, heartSize / 30);
  context.beginPath();
  context.moveTo(0, 8);
  context.bezierCurveTo(-18, -6, -16, -22, 0, -14);
  context.bezierCurveTo(16, -22, 18, -6, 0, 8);
  context.fillStyle = fillColor;
  context.fill();
  context.restore();
}

/**
 * Цветок с мягким свечением.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} petalRadius
 * @param {string} petalColor
 * @param {string} petalColorAlt
 * @param {number} petalCount
 */
function drawBloomFlowerV3(context, centerX, centerY, petalRadius, petalColor, petalColorAlt, petalCount) {
  assert(petalRadius > 0, `Expected positive petalRadius, got ${petalRadius}`);
  assert(petalCount >= 4, `Expected petalCount >= 4, got ${petalCount}`);
  context.save();
  context.translate(centerX, centerY);
  context.globalAlpha = randomRange(0.5, 0.78);
  const angleStep = (Math.PI * 2) / petalCount;
  for (let petalIndex = 0; petalIndex < petalCount; petalIndex++) {
    context.save();
    context.rotate(angleStep * petalIndex);
    const petalGradient = createLinearColorGradient(
      context,
      0,
      -petalRadius * 0.15,
      petalRadius * 0.9,
      petalRadius * 0.15,
      blendColors(petalColor, '#FFFFFF', 0.25),
      petalColorAlt,
    );
    context.beginPath();
    context.ellipse(petalRadius * 0.52, 0, petalRadius * 0.52, petalRadius * 0.26, 0, 0, Math.PI * 2);
    context.fillStyle = petalGradient;
    context.fill();
    context.restore();
  }
  const centerGlow = createRadialColorGradient(
    context,
    0,
    0,
    0,
    petalRadius * 0.28,
    blendColors(petalColorAlt, '#FFF4C8', 0.45),
    blendColors(petalColor, '#8B6914', 0.35),
  );
  context.beginPath();
  context.arc(0, 0, petalRadius * 0.2, 0, Math.PI * 2);
  context.fillStyle = centerGlow;
  context.globalAlpha = randomRange(0.65, 0.85);
  context.fill();
  context.restore();
}

/**
 * Лист с градиентом.
 * @param {CanvasRenderingContext2D} context
 * @param {number} originX
 * @param {number} originY
 * @param {number} leafLength
 * @param {number} rotation
 * @param {string} leafColor
 * @param {string} leafColorAlt
 */
function drawLeafV3(context, originX, originY, leafLength, rotation, leafColor, leafColorAlt) {
  context.save();
  context.translate(originX, originY);
  context.rotate(rotation);
  context.globalAlpha = randomRange(0.38, 0.62);
  const leafGradient = createLinearColorGradient(
    context,
    0,
    -leafLength * 0.2,
    leafLength,
    leafLength * 0.2,
    leafColor,
    leafColorAlt,
  );
  context.beginPath();
  context.moveTo(0, 0);
  context.quadraticCurveTo(leafLength * 0.5, -leafLength * 0.38, leafLength, 0);
  context.quadraticCurveTo(leafLength * 0.5, leafLength * 0.38, 0, 0);
  context.fillStyle = leafGradient;
  context.fill();
  context.restore();
}

/**
 * Ботанический угол с цветами.
 * @param {CanvasRenderingContext2D} context
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {number} scale
 * @param {{decor: string, foil: string, accent: string}} palette
 * @param {number} mirrorX
 * @param {number} mirrorY
 */
function drawBotanicalCornerV3(context, anchorX, anchorY, scale, palette, mirrorX, mirrorY) {
  context.save();
  context.translate(anchorX, anchorY);
  context.scale(mirrorX * scale, mirrorY * scale);
  const leafColor = blendColors(palette.decor, '#3A5A30', 0.22);
  const leafColorAlt = blendColors(palette.decor, '#FFFFFF', 0.4);
  drawLeafV3(context, 0, 0, 130, randomRange(-0.35, 0.05), leafColor, leafColorAlt);
  drawLeafV3(context, 36, 24, 100, randomRange(0.15, 0.55), leafColorAlt, leafColor);
  drawLeafV3(context, 70, 8, 70, randomRange(-0.5, -0.1), leafColor, leafColorAlt);
  drawBloomFlowerV3(
    context,
    88,
    70,
    48,
    palette.decor,
    blendColors(palette.foil, '#FFFFFF', 0.2),
    6,
  );
  drawBloomFlowerV3(
    context,
    150,
    36,
    34,
    blendColors(palette.decor, '#FFFFFF', 0.15),
    blendColors(palette.accent, palette.foil, 0.3),
    5,
  );
  context.restore();
}

/**
 * Орнаментальный уголок рамки.
 * @param {CanvasRenderingContext2D} context
 * @param {number} cornerX
 * @param {number} cornerY
 * @param {number} rotation
 * @param {string} strokeColor
 * @param {number} armLength
 */
function drawFiligreeCornerV3(context, cornerX, cornerY, rotation, strokeColor, armLength) {
  context.save();
  context.translate(cornerX, cornerY);
  context.rotate(rotation);
  context.strokeStyle = strokeColor;
  context.lineWidth = randomRange(1.4, 2.2);
  context.lineCap = 'round';
  context.globalAlpha = randomRange(0.45, 0.7);

  context.beginPath();
  context.moveTo(0, armLength);
  context.lineTo(0, 0);
  context.lineTo(armLength, 0);
  context.stroke();

  context.beginPath();
  context.arc(armLength * 0.22, armLength * 0.22, armLength * 0.22, Math.PI, Math.PI * 1.5);
  context.stroke();

  context.beginPath();
  context.moveTo(armLength * 0.55, 0);
  context.quadraticCurveTo(armLength * 0.55, -armLength * 0.28, armLength * 0.9, -armLength * 0.18);
  context.stroke();

  context.beginPath();
  context.moveTo(0, armLength * 0.55);
  context.quadraticCurveTo(-armLength * 0.28, armLength * 0.55, -armLength * 0.18, armLength * 0.9);
  context.stroke();

  context.fillStyle = strokeColor;
  context.globalAlpha = randomRange(0.35, 0.55);
  context.beginPath();
  context.arc(0, 0, 3.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * Двойная праздничная рамка с филигранью.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string}} palette
 */
function drawOrnamentalFrameV3(context, palette) {
  const margin = randomRange(52, 68);
  const inset = margin + randomRange(14, 22);
  context.save();

  const outerGradient = createLinearColorGradient(
    context,
    margin,
    margin,
    CARD_WIDTH - margin,
    CARD_HEIGHT - margin,
    palette.foil,
    blendColors(palette.accent, palette.decor, 0.4),
  );
  context.strokeStyle = outerGradient;
  context.globalAlpha = randomRange(0.5, 0.68);
  context.lineWidth = randomRange(2.2, 3.2);
  context.strokeRect(margin, margin, CARD_WIDTH - margin * 2, CARD_HEIGHT - margin * 2);

  const innerGradient = createLinearColorGradient(
    context,
    inset,
    inset,
    CARD_WIDTH - inset,
    CARD_HEIGHT - inset,
    blendColors(palette.accent, '#FFFFFF', 0.35),
    blendColors(palette.foil, palette.decor, 0.3),
  );
  context.strokeStyle = innerGradient;
  context.globalAlpha = randomRange(0.32, 0.48);
  context.lineWidth = 1.2;
  context.strokeRect(inset, inset, CARD_WIDTH - inset * 2, CARD_HEIGHT - inset * 2);

  const armLength = randomRange(48, 68);
  const cornerColor = rgbToRgba(palette.foil, 0.85);
  drawFiligreeCornerV3(context, margin, margin, 0, cornerColor, armLength);
  drawFiligreeCornerV3(context, CARD_WIDTH - margin, margin, Math.PI / 2, cornerColor, armLength);
  drawFiligreeCornerV3(context, CARD_WIDTH - margin, CARD_HEIGHT - margin, Math.PI, cornerColor, armLength);
  drawFiligreeCornerV3(context, margin, CARD_HEIGHT - margin, -Math.PI / 2, cornerColor, armLength);
  context.restore();
}

/**
 * Конфетти и искорки по краям (не перекрывают текст).
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string}} palette
 */
function drawCelebratoryScatterV3(context, palette) {
  const confettiCount = randomInt(28, 42);
  const paletteColors = [palette.foil, palette.accent, palette.decor, blendColors(palette.foil, '#FFFFFF', 0.4)];
  for (let confettiIndex = 0; confettiIndex < confettiCount; confettiIndex++) {
    const placeInMargin = Math.random() < 0.55;
    let confettiX;
    let confettiY;
    if (placeInMargin) {
      const edgeChoice = randomInt(0, 3);
      if (edgeChoice === 0) {
        confettiX = randomRange(40, CARD_WIDTH - 40);
        confettiY = randomRange(40, 160);
      } else if (edgeChoice === 1) {
        confettiX = randomRange(40, CARD_WIDTH - 40);
        confettiY = randomRange(CARD_HEIGHT - 180, CARD_HEIGHT - 40);
      } else if (edgeChoice === 2) {
        confettiX = randomRange(40, 140);
        confettiY = randomRange(160, CARD_HEIGHT - 180);
      } else {
        confettiX = randomRange(CARD_WIDTH - 140, CARD_WIDTH - 40);
        confettiY = randomRange(160, CARD_HEIGHT - 180);
      }
    } else {
      confettiX = randomRange(120, CARD_WIDTH - 120);
      confettiY = randomRange(140, CARD_HEIGHT - 160);
    }

    const confettiColor = paletteColors[confettiIndex % paletteColors.length];
    context.save();
    context.translate(confettiX, confettiY);
    context.rotate(randomRange(0, Math.PI * 2));
    context.globalAlpha = randomRange(0.22, 0.48);
    const shapeKind = confettiIndex % 4;
    if (shapeKind === 0) {
      context.fillStyle = confettiColor;
      context.fillRect(-randomRange(3, 7), -randomRange(1.5, 3), randomRange(6, 14), randomRange(3, 6));
    } else if (shapeKind === 1) {
      drawStarV3(context, 0, 0, randomRange(5, 11), confettiColor, 0);
    } else if (shapeKind === 2) {
      context.fillStyle = confettiColor;
      context.beginPath();
      context.arc(0, 0, randomRange(2, 4.5), 0, Math.PI * 2);
      context.fill();
    } else {
      context.strokeStyle = confettiColor;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(-6, 0);
      context.lineTo(6, 0);
      context.moveTo(0, -6);
      context.lineTo(0, 6);
      context.stroke();
    }
    context.restore();
  }
}

/**
 * Изящный разделитель с ромбом по центру.
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerY
 * @param {{foil: string, accent: string}} palette
 */
function drawTextFlourishDividerV3(context, centerY, palette) {
  const halfWidth = randomRange(120, 170);
  context.save();
  context.strokeStyle = rgbToRgba(palette.foil, 0.55);
  context.fillStyle = rgbToRgba(palette.accent, 0.5);
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2 - halfWidth, centerY);
  context.lineTo(CARD_WIDTH / 2 - 18, centerY);
  context.stroke();
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2 + 18, centerY);
  context.lineTo(CARD_WIDTH / 2 + halfWidth, centerY);
  context.stroke();
  context.beginPath();
  context.moveTo(CARD_WIDTH / 2, centerY - 7);
  context.lineTo(CARD_WIDTH / 2 + 7, centerY);
  context.lineTo(CARD_WIDTH / 2, centerY + 7);
  context.lineTo(CARD_WIDTH / 2 - 7, centerY);
  context.closePath();
  context.fill();
  context.restore();
}

/**
 * Лента-баннер с мягким блеском.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string}} palette
 * @param {string} category
 */
function drawRibbonBannerV3(context, palette, category) {
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
  const bannerY = randomRange(108, 150);
  const bannerWidth = randomRange(300, 400);
  const bannerHeight = 58;
  const bannerLeft = CARD_WIDTH / 2 - bannerWidth / 2;
  const bannerRight = CARD_WIDTH / 2 + bannerWidth / 2;

  context.save();
  context.shadowColor = rgbToRgba(palette.accent, 0.25);
  context.shadowBlur = 14;
  context.shadowOffsetY = 4;
  const bannerGradient = createLinearColorGradient(
    context,
    bannerLeft,
    bannerY,
    bannerRight,
    bannerY + bannerHeight,
    blendColors(palette.accent, palette.foil, 0.35),
    blendColors(palette.decor, palette.accent, 0.25),
  );
  context.fillStyle = bannerGradient;
  context.globalAlpha = randomRange(0.72, 0.86);
  context.beginPath();
  context.moveTo(bannerLeft, bannerY);
  context.lineTo(bannerRight, bannerY);
  context.lineTo(bannerRight + 22, bannerY + bannerHeight / 2);
  context.lineTo(bannerRight, bannerY + bannerHeight);
  context.lineTo(bannerLeft, bannerY + bannerHeight);
  context.lineTo(bannerLeft - 22, bannerY + bannerHeight / 2);
  context.closePath();
  context.fill();

  const sheenGradient = context.createLinearGradient(bannerLeft, bannerY, bannerRight, bannerY);
  sheenGradient.addColorStop(0, 'rgba(255,255,255,0)');
  sheenGradient.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  sheenGradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = sheenGradient;
  context.globalAlpha = 0.55;
  context.fill();

  context.shadowBlur = 0;
  context.globalAlpha = 0.95;
  context.font = `46px "Montserrat", sans-serif`;
  context.fillStyle = '#FFFFFF';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(symbol, CARD_WIDTH / 2, bannerY + bannerHeight / 2 + 1);
  context.restore();
}

/**
 * Одна строка текста с мягким свечением и лёгким «фольгированным» градиентом.
 * @param {CanvasRenderingContext2D} context
 * @param {string} lineText
 * @param {number} centerY
 * @param {number} fontSize
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {boolean} useItalic
 * @param {{text: string, accent: string, foil: string}} palette
 */
function drawStyledTextLineV3(context, lineText, centerY, fontSize, fontStyle, useItalic, palette) {
  if (fontStyle === 'mixed' && useItalic) {
    context.font = `italic ${fontSize + 6}px "Playfair Display", Georgia, serif`;
  } else {
    context.font = getMainFont(fontStyle, fontSize);
  }

  const characters = [...lineText];
  const fullLineWidth = context.measureText(lineText).width;
  let cursorX = CARD_WIDTH / 2 - fullLineWidth / 2;

  for (let charIndex = 0; charIndex < characters.length; charIndex++) {
    const character = characters[charIndex];
    const charWidth = context.measureText(character).width;
    const charCenterX = cursorX + charWidth / 2;
    const charCenterY = centerY + Math.sin(charIndex * 0.55) * 1.2;

    context.save();
    context.translate(charCenterX, charCenterY);
    context.rotate(randomRange(-0.02, 0.02));

    context.shadowColor = rgbToRgba(blendColors(palette.foil, '#FFFFFF', 0.3), 0.35);
    context.shadowBlur = randomRange(4, 9);
    context.shadowOffsetY = 1;

    const textGradient = createLinearColorGradient(
      context,
      -charWidth * 0.5,
      -fontSize * 0.45,
      charWidth * 0.5,
      fontSize * 0.4,
      blendColors(palette.text, palette.accent, 0.08),
      blendColors(palette.text, palette.foil, 0.12),
    );
    context.fillStyle = textGradient;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(character, 0, 0);
    context.restore();

    cursorX += charWidth;
  }
}

/**
 * Основной текст пожелания v3.
 * @param {CanvasRenderingContext2D} context
 * @param {string} wishText
 * @param {{text: string, accent: string, foil: string}} palette
 * @param {'serif' | 'script' | 'mixed'} fontStyle
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 */
function drawWishTextV3(context, wishText, palette, fontStyle, layout) {
  const textLayout = layoutWishTextBlock(context, wishText, fontStyle, layout);
  const { lines, fontSize, lineHeight, startY } = textLayout;

  drawTextFlourishDividerV3(context, startY - lineHeight * 0.65, palette);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineY = startY + lineIndex * lineHeight;
    drawStyledTextLineV3(context, lines[lineIndex], lineY, fontSize, fontStyle, lineIndex === 0, palette);
  }

  const lastLineY = startY + (lines.length - 1) * lineHeight;
  drawTextFlourishDividerV3(context, lastLineY + lineHeight * 0.65, palette);
}

/**
 * Подпись с росчерком.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string}} palette
 * @param {string} signatureText
 */
function drawSignatureV3(context, palette, signatureText) {
  const signatureY = CARD_HEIGHT - randomRange(88, 118);
  context.save();
  context.translate(CARD_WIDTH / 2, signatureY);
  context.rotate(randomRange(-0.02, 0.02));
  context.font = `58px "Caveat", cursive`;
  context.fillStyle = createLinearColorGradient(
    context,
    -240,
    -16,
    240,
    16,
    blendColors(palette.accent, '#000000', 0.35),
    blendColors(palette.foil, palette.decor, 0.2),
  );
  context.globalAlpha = randomRange(0.78, 0.92);
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.shadowColor = rgbToRgba(palette.foil, 0.2);
  context.shadowBlur = 6;
  context.fillText(signatureText, 0, 0);

  context.shadowBlur = 0;
  context.strokeStyle = rgbToRgba(palette.foil, 0.4);
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(-90, 10);
  context.quadraticCurveTo(0, 22, 90, 8);
  context.stroke();
  context.restore();
}

/**
 * Праздничные мотивы по категории.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string}} palette
 * @param {string} category
 */
function drawCategoryMotifsV3(context, palette, category) {
  const festiveCategories = new Set(['holiday', 'success', 'mood', 'warmth', 'friendship', 'gratitude']);
  if (!festiveCategories.has(category) && Math.random() > 0.45) {
    return;
  }

  const motifCount = randomInt(4, 8);
  for (let motifIndex = 0; motifIndex < motifCount; motifIndex++) {
    const motifX = randomRange(100, CARD_WIDTH - 100);
    const motifY = randomRange(120, CARD_HEIGHT - 140);
    const distanceFromCenter = Math.hypot(motifX - CARD_WIDTH / 2, motifY - CARD_HEIGHT / 2);
    if (distanceFromCenter < 220) {
      continue;
    }
    context.save();
    context.globalAlpha = randomRange(0.18, 0.38);
    const motifColor = rgbToRgba(
      blendColors(palette.foil, palette.decor, randomRange(0, 0.5)),
      1,
    );
    if (category === 'mood' || category === 'warmth' || category === 'friendship') {
      drawHeartV3(context, motifX, motifY, randomRange(12, 22), motifColor, randomRange(-0.35, 0.35));
    } else {
      drawStarV3(context, motifX, motifY, randomRange(8, 18), motifColor, randomRange(0, Math.PI));
    }
    context.restore();
  }
}

/**
 * Декор макета v3.
 * @param {CanvasRenderingContext2D} context
 * @param {{accent: string, decor: string, foil: string}} palette
 * @param {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'} layout
 * @param {string} category
 */
function drawLayoutDecorationsV3(context, palette, layout, category) {
  drawCelebratoryScatterV3(context, palette);
  drawCategoryMotifsV3(context, palette, category);

  if (layout === 'classic' || layout === 'minimal' || layout === 'ribbon') {
    drawOrnamentalFrameV3(context, palette);
  }

  if (layout === 'corner' || layout === 'classic' || layout === 'botanical') {
    const scale = randomRange(0.9, 1.2);
    drawBotanicalCornerV3(context, 55, 55, scale, palette, 1, 1);
    drawBotanicalCornerV3(context, CARD_WIDTH - 55, CARD_HEIGHT - 55, scale * 0.92, palette, -1, -1);
  }

  if (layout === 'botanical') {
    drawBotanicalCornerV3(context, CARD_WIDTH - 70, 90, randomRange(0.75, 1.05), palette, -1, 1);
    drawBotanicalCornerV3(context, 70, CARD_HEIGHT - 110, randomRange(0.7, 0.95), palette, 1, -1);
    const flowerCount = randomInt(3, 6);
    for (let flowerIndex = 0; flowerIndex < flowerCount; flowerIndex++) {
      drawBloomFlowerV3(
        context,
        randomRange(140, CARD_WIDTH - 140),
        randomRange(140, CARD_HEIGHT - 200),
        randomRange(20, 36),
        blendColors(palette.decor, '#FFFFFF', randomRange(0, 0.25)),
        blendColors(palette.foil, palette.accent, randomRange(0.15, 0.4)),
        randomInt(5, 7),
      );
    }
  }

  if (layout === 'ribbon') {
    drawRibbonBannerV3(context, palette, category);
  }

  if (layout === 'minimal') {
    context.save();
    const sparkleCount = randomInt(10, 16);
    for (let sparkleIndex = 0; sparkleIndex < sparkleCount; sparkleIndex++) {
      const sparkleX = randomRange(120, CARD_WIDTH - 120);
      const sparkleY = randomRange(140, CARD_HEIGHT - 140);
      context.globalAlpha = randomRange(0.2, 0.4);
      context.strokeStyle = rgbToRgba(palette.foil, 0.7);
      context.lineWidth = 1.1;
      context.beginPath();
      context.moveTo(sparkleX - 5, sparkleY);
      context.lineTo(sparkleX + 5, sparkleY);
      context.moveTo(sparkleX, sparkleY - 5);
      context.lineTo(sparkleX, sparkleY + 5);
      context.stroke();
    }
    context.restore();
  }

  if (layout === 'corner') {
    drawOrnamentalFrameV3(context, palette);
  }
}

/**
 * Тёплый праздничный цветокор — лёгкое золочение и контраст.
 * @param {CanvasRenderingContext2D} context
 * @param {number} seed
 */
function applyCelebratoryColorGradeV3(context, seed) {
  const imageData = context.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const pixels = imageData.data;
  const blockSize = 16;

  for (let blockY = 0; blockY < CARD_HEIGHT; blockY += blockSize) {
    for (let blockX = 0; blockX < CARD_WIDTH; blockX += blockSize) {
      const blockWave = Math.sin(blockX * 0.006 + seed) * Math.cos(blockY * 0.0045 + seed * 1.1);
      const warmthShift = 2.8 + blockWave * 2.2;
      const greenShift = Math.sin(seed * 0.7 + blockX * 0.008) * 1.8;
      const blueCool = Math.cos(seed * 0.9 + blockY * 0.007) * 1.5;

      for (let localY = 0; localY < blockSize && blockY + localY < CARD_HEIGHT; localY++) {
        for (let localX = 0; localX < blockSize && blockX + localX < CARD_WIDTH; localX++) {
          const pixelX = blockX + localX;
          const pixelY = blockY + localY;
          const pixelIndex = (pixelY * CARD_WIDTH + pixelX) * 4;
          const fineWave = Math.sin(pixelX * 0.022 + seed * 0.35) * Math.cos(pixelY * 0.02 + seed * 0.28);
          pixels[pixelIndex] = clampByte(pixels[pixelIndex] + warmthShift + fineWave * 1.4);
          pixels[pixelIndex + 1] = clampByte(pixels[pixelIndex + 1] + greenShift + fineWave * 0.9);
          pixels[pixelIndex + 2] = clampByte(pixels[pixelIndex + 2] - blueCool * 0.4 + fineWave * 1.1);

          const contrastFactor = 1.04;
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
 * Генерирует открытку v3.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3', postProcessSeed: number} | null} [cardState]
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3', postProcessSeed: number, exportBackgroundColor: string}}}
 */
export function generateGreetingCardV3(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v3);
  assert(state.text.trim().length > 0, 'Wish text must not be empty');
  const palette = enrichPaletteForV3(getPaletteForCategory(state.category));
  const postProcessSeed = state.postProcessSeed ?? randomRange(0, 10000);

  const canvas = getRenderCanvas();
  const context = getRenderContext();
  assert(context !== null, 'Render context is null');

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  fillOpaqueCanvasBase(context, palette.background[0]);
  drawLuminousBackgroundV3(context, palette);
  drawLayoutDecorationsV3(context, palette, state.layout, state.category);
  drawWishTextV3(context, state.text, palette, state.fontStyle, state.layout);
  drawSignatureV3(context, palette, state.signature);
  applyCelebratoryColorGradeV3(context, postProcessSeed);

  const opaqueCanvas = flattenCanvasToOpaque(canvas, palette.background[0]);
  return {
    canvas: opaqueCanvas,
    cardState: {
      ...state,
      rendererVersion: CARD_RENDERER_VERSIONS.v3,
      postProcessSeed,
      exportBackgroundColor: palette.background[0],
    },
  };
}
