/** Vitest: JPEG block-grid reset preserves size and changes pixels (browser APIs). */

import { describe, expect, it } from "vitest";
import {
  JPEG_BLOCK_GRID_RESET_GLOSSARY,
  resetJpegBlockGrid,
} from "../src/cover/jpeg-block-grid-reset.js";

const canUseCanvasApis = (
  typeof document !== "undefined"
  && typeof document.createElement === "function"
  && typeof createImageBitmap === "function"
  && typeof HTMLCanvasElement !== "undefined"
);

describe("JPEG block-grid reset glossary", () => {
  it("documents the formal name and шакализация alias", () => {
    expect(JPEG_BLOCK_GRID_RESET_GLOSSARY.formalName).toBe("JPEG block-grid reset");
    expect(JPEG_BLOCK_GRID_RESET_GLOSSARY.informalAliasRu).toBe("шакализация");
  });
});

describe.skipIf(!canUseCanvasApis)("JPEG block-grid reset", () => {
  it("keeps dimensions and changes the raster after mild round-trips", async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 96;
    sourceCanvas.height = 120;
    const context = sourceCanvas.getContext("2d");
    expect(context).not.toBeNull();
    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        context.fillStyle = `rgb(${(x * 3) & 255}, ${(y * 5) & 255}, 120)`;
        context.fillRect(x, y, 1, 1);
      }
    }
    const sourcePixels = context.getImageData(0, 0, 96, 120).data.slice();
    const resetResult = await resetJpegBlockGrid(sourceCanvas);
    expect(resetResult.canvas.width).toBe(96);
    expect(resetResult.canvas.height).toBe(120);
    expect(resetResult.stats.iterationCount).toBeGreaterThanOrEqual(2);
    expect(resetResult.stats.iterationCount).toBeLessThanOrEqual(4);
    expect(resetResult.jpegBytes[0]).toBe(0xff);
    expect(resetResult.jpegBytes[1]).toBe(0xd8);
    const resetContext = resetResult.canvas.getContext("2d");
    expect(resetContext).not.toBeNull();
    const resetPixels = resetContext.getImageData(0, 0, 96, 120).data;
    let changedCount = 0;
    for (let byteIndex = 0; byteIndex < sourcePixels.length; byteIndex += 1) {
      if (sourcePixels[byteIndex] !== resetPixels[byteIndex]) {
        changedCount += 1;
      }
    }
    expect(changedCount).toBeGreaterThan(0);
  }, 20_000);
});
