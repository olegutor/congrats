/** Vitest: STC round-trip and framing. */

import { describe, expect, it } from "vitest";
import { framePayloadBytes, unframePayloadBytes } from "../src/payload/codec.js";
import { feistelMixBits } from "../src/crypto/bit-diffusion/feistel.js";
import { bytesToBits, bitsToBytes } from "../src/crypto/binary-payload.js";
import { stcEmbed, stcExtract } from "../src/stego/stc.js";
import { computeHillCosts } from "../src/stego/hill-costs.js";
import {
  embedBitsIntoImageData,
  extractBitsFromImageData,
} from "../src/stego/spatial-embed.js";
import { gcmwrapEncrypt, gcmwrapTryDecrypt } from "../src/crypto/gcmwrap.js";

/**
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
function makeNoiseImageData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = (index * 17) & 255;
    data[index + 1] = (index * 31) & 255;
    data[index + 2] = (index * 47) & 255;
    data[index + 3] = 255;
  }
  return { width, height, data, colorSpace: "srgb" };
}

describe("framePayloadBytes", () => {
  it("round-trips payload bytes", () => {
    const payload = new TextEncoder().encode("привет, открытка");
    const framed = framePayloadBytes(payload);
    expect(unframePayloadBytes(framed)).toEqual(payload);
  });
});

describe("feistel + bytes", () => {
  it("round-trips bit strings", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 250, 251]);
    const bits = bytesToBits(payload);
    const mixed = feistelMixBits(bits, false);
    const restored = feistelMixBits(mixed, true);
    expect(bitsToBytes(restored)).toEqual(payload);
  });
});

describe("gcmwrap", () => {
  it("encrypts and decrypts", async () => {
    const payload = new TextEncoder().encode("secret wish");
    const sealed = await gcmwrapEncrypt(payload, "test-password");
    const opened = await gcmwrapTryDecrypt(sealed, "test-password");
    expect(opened).toEqual(payload);
  });
});

describe("STC", () => {
  it("embeds and extracts a short message", () => {
    const messageBits = new Uint8Array(128);
    for (let index = 0; index < messageBits.length; index += 1) {
      messageBits[index] = index % 2;
    }
    const coverBitCount = 1600;
    const coverBits = new Uint8Array(coverBitCount);
    const costs = new Float64Array(coverBitCount);
    for (let index = 0; index < coverBitCount; index += 1) {
      coverBits[index] = (index * 3) & 1;
      costs[index] = 1 + (index % 7);
    }
    const seed = new TextEncoder().encode("unit-test-hhat");
    const { stegoBits, changedCount } = stcEmbed(coverBits, costs, messageBits, seed);
    expect(changedCount).toBeGreaterThan(0);
    expect(changedCount).toBeLessThan(coverBitCount / 2);
    const extracted = stcExtract(stegoBits, messageBits.length, seed);
    expect(extracted).toEqual(messageBits);
  });
});

describe("HILL costs", () => {
  it("returns finite positive costs", () => {
    const imageData = makeNoiseImageData(32, 32);
    const costs = computeHillCosts(imageData);
    expect(costs.length).toBe(32 * 32);
    for (const cost of costs) {
      expect(Number.isFinite(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
    }
  });
});

describe("spatial HILL+STC", () => {
  it("round-trips bits in a synthetic image", () => {
    const imageData = makeNoiseImageData(120, 150);
    const messageBits = new Uint8Array(256);
    for (let index = 0; index < messageBits.length; index += 1) {
      messageBits[index] = (index * 5) & 1;
    }
    const stats = embedBitsIntoImageData(imageData, messageBits);
    expect(stats.messageBitCount).toBe(256);
    const extracted = extractBitsFromImageData(imageData);
    expect(extracted).toEqual(messageBits);
  });
});

describe("full codec", () => {
  it("round-trips text with password crypto", async () => {
    const { encodeBytesIntoImageData, decodeBytesFromImageData } = await import(
      "../src/payload/codec.js"
    );
    const imageData = makeNoiseImageData(200, 250);
    const payloadBytes = new TextEncoder().encode("секретное пожелание 🎉");
    await encodeBytesIntoImageData(imageData, payloadBytes, { password: "s3cret" });
    const { payloadBytes: decoded } = await decodeBytesFromImageData(imageData, {
      password: "s3cret",
    });
    expect(decoded).toEqual(payloadBytes);
  });
});
