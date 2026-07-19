/** Vitest coverage for headerless fixed-length spatial HILL + STC APIs. */

import { describe, expect, it } from "vitest";
import {
  embedBitsIntoImageData,
  embedFixedBitsIntoImageData,
  extractBitsFromImageData,
  extractFixedBitsFromImageData,
} from "../src/stego/spatial-embed.js";

/**
 * Build deterministic synthetic RGBA image data.
 *
 * @param {number} width
 * @param {number} height
 * @returns {ImageData} data shape (width * height * 4,)
 */
function makeNoiseImageData(width, height) {
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  for (let byteOffset = 0; byteOffset < rgbaData.length; byteOffset += 4) {
    rgbaData[byteOffset] = (byteOffset * 17 + 23) & 255;
    rgbaData[byteOffset + 1] = (byteOffset * 31 + 71) & 255;
    rgbaData[byteOffset + 2] = (byteOffset * 47 + 113) & 255;
    rgbaData[byteOffset + 3] = 255;
  }
  return { width, height, data: rgbaData, colorSpace: "srgb" };
}

/**
 * Build deterministic message bits.
 *
 * @param {number} messageBitCount
 * @returns {Uint8Array} shape (messageBitCount,) values in {0,1}
 */
function makeMessageBits(messageBitCount) {
  const messageBits = new Uint8Array(messageBitCount);
  for (let bitIndex = 0; bitIndex < messageBitCount; bitIndex += 1) {
    messageBits[bitIndex] = ((bitIndex * 13 + 5) >>> 2) & 1;
  }
  return messageBits;
}

describe("fixed-length spatial HILL+STC", () => {
  it("round-trips exactly the externally specified bits with string or byte keys", () => {
    const imageData = makeNoiseImageData(120, 150);
    const messageBits = makeMessageBits(257);
    const channelKeyBytes = new TextEncoder().encode("public-key-fingerprint");

    const embeddingStats = embedFixedBitsIntoImageData(
      imageData,
      messageBits,
      channelKeyBytes,
    );
    const extractedBits = extractFixedBitsFromImageData(
      imageData,
      "public-key-fingerprint",
      messageBits.length,
    );

    expect(embeddingStats.messageBitCount).toBe(messageBits.length);
    expect(extractedBits).toHaveLength(messageBits.length);
    expect(extractedBits).toEqual(messageBits);
  });

  it("makes no modifications outside the STC payload", () => {
    const imageData = makeNoiseImageData(120, 150);
    const originalRgbaData = imageData.data.slice();
    const messageBits = makeMessageBits(191);

    const embeddingStats = embedFixedBitsIntoImageData(
      imageData,
      messageBits,
      "headerless-channel",
    );

    let changedRgbChannelCount = 0;
    for (let byteOffset = 0; byteOffset < imageData.data.length; byteOffset += 4) {
      for (let channelOffset = 0; channelOffset < 3; channelOffset += 1) {
        if (imageData.data[byteOffset + channelOffset]
          !== originalRgbaData[byteOffset + channelOffset]) {
          changedRgbChannelCount += 1;
        }
      }
      expect(imageData.data[byteOffset + 3]).toBe(originalRgbaData[byteOffset + 3]);
    }

    expect(changedRgbChannelCount).toBe(embeddingStats.changedCount);
  });

  it("returns requested bits for ordinary images and unrelated keys", () => {
    const ordinaryImageData = makeNoiseImageData(120, 150);
    const arbitraryBits = extractFixedBitsFromImageData(
      ordinaryImageData,
      "arbitrary-public-channel",
      83,
    );
    expect(arbitraryBits).toHaveLength(83);

    const messageBits = makeMessageBits(193);
    embedFixedBitsIntoImageData(ordinaryImageData, messageBits, "correct-channel");
    const wrongKeyBits = extractFixedBitsFromImageData(
      ordinaryImageData,
      "wrong-channel",
      messageBits.length,
    );
    expect(wrongKeyBits).toHaveLength(messageBits.length);
    expect(wrongKeyBits).not.toEqual(messageBits);
  });

  it("leaves the existing concealed-length API behavior unchanged", () => {
    const imageData = makeNoiseImageData(120, 150);
    const messageBits = makeMessageBits(211);

    const embeddingStats = embedBitsIntoImageData(
      imageData,
      messageBits,
      "legacy-spatial-passphrase",
    );
    const extractedBits = extractBitsFromImageData(imageData, "legacy-spatial-passphrase");

    expect(embeddingStats.messageBitCount).toBe(messageBits.length);
    expect(extractedBits).toEqual(messageBits);
  });
});
