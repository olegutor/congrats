/** Vitest: keyed STC and codec round-trips without public stego markers. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { feistelMixBits } from "../src/crypto/bit-diffusion/feistel.js";
import { bytesToBits, bitsToBytes } from "../src/crypto/binary-payload.js";
import { stcEmbed, stcExtract } from "../src/stego/stc.js";
import { computeHillCosts } from "../src/stego/hill-costs.js";
import {
  embedBitsIntoImageData,
  extractBitsFromImageData,
} from "../src/stego/spatial-embed.js";
import { gcmwrapEncrypt, gcmwrapTryDecrypt } from "../src/crypto/gcmwrap.js";
import { setPhasmWasmInitOverride } from "../src/stego/jpeg-phasm.js";
import initPhasmWasm from "../vendor/phasm/congrats_phasm_wasm.js";

beforeAll(async () => {
  const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
  const wasmBytes = readFileSync(
    join(fixtureDirectory, "../vendor/phasm/congrats_phasm_wasm_bg.wasm"),
  );
  setPhasmWasmInitOverride(async () => {
    await initPhasmWasm({ module_or_path: wasmBytes });
  });
});

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
    const coverPixels = imageData.data.slice();
    const messageBits = new Uint8Array(256);
    for (let index = 0; index < messageBits.length; index += 1) {
      messageBits[index] = (index * 5) & 1;
    }
    const stats = embedBitsIntoImageData(imageData, messageBits, "spatial-test-passphrase");
    expect(stats.messageBitCount).toBe(256);
    const extracted = extractBitsFromImageData(imageData, "spatial-test-passphrase");
    expect(extracted).toEqual(messageBits);
    const changedByChannel = [0, 0, 0];
    for (let byteOffset = 0; byteOffset < imageData.data.length; byteOffset += 4) {
      for (let channelOffset = 0; channelOffset < 3; channelOffset += 1) {
        if (imageData.data[byteOffset + channelOffset] !== coverPixels[byteOffset + channelOffset]) {
          changedByChannel[channelOffset] += 1;
        }
      }
    }
    expect(changedByChannel.every((changedCount) => changedCount > 0)).toBe(true);
    expect(stats.embeddingRate).toBeGreaterThanOrEqual(0.07);
    expect(stats.embeddingRate).toBeLessThanOrEqual(0.13);
  });

  it("uses no fixed public header bits", () => {
    const imageData = makeNoiseImageData(120, 150);
    const messageBits = new Uint8Array(256);
    embedBitsIntoImageData(imageData, messageBits, "same-passphrase");
    const initialBlueLsbs = [];
    for (let pixelIndex = 0; pixelIndex < 24; pixelIndex += 1) {
      initialBlueLsbs.push(imageData.data[pixelIndex * 4 + 2] & 1);
    }
    const removedPublicHeaderPrefix = [
      0, 1, 0, 0, 0, 0, 1, 1, // C
      0, 1, 0, 1, 0, 0, 1, 1, // S
      0, 0, 0, 0, 0, 0, 0, 1, // version 1
    ];
    expect(initialBlueLsbs).not.toEqual(removedPublicHeaderPrefix);
  });
});

describe("full codec", () => {
  it("round-trips text with password crypto", async () => {
    const { encodeBytesIntoImageData, decodeBytesFromImageData } = await import(
      "../src/payload/codec.js"
    );
    const imageData = makeNoiseImageData(200, 250);
    const payloadBytes = new TextEncoder().encode("секретное пожелание 🎉");
    await encodeBytesIntoImageData(imageData, payloadBytes, {
      stegoPassphrase: "s3cret",
      password: "s3cret",
    });
    const { payloadBytes: decoded } = await decodeBytesFromImageData(imageData, {
      stegoPassphrase: "s3cret",
      password: "s3cret",
    });
    expect(decoded).toEqual(payloadBytes);
  });
});

describe("JPEG Ghost J-UNIWARD (phasm)", () => {
  it("round-trips payload with a secret Ghost passphrase", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const {
      encodeBytesIntoJpegBytes,
      decodeBytesFromJpegBytes,
    } = await import("../src/payload/codec.js");

    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const coverJpeg = new Uint8Array(
      readFileSync(join(fixtureDirectory, "fixtures/cover_320x240.jpg")),
    );
    const payloadBytes = new TextEncoder().encode("jpeg ghost secret");
    const cryptoOptions = { stegoPassphrase: "jpeg-channel-secret" };
    const { jpegBytes } = await encodeBytesIntoJpegBytes(
      coverJpeg,
      payloadBytes,
      cryptoOptions,
    );
    const { payloadBytes: decoded } = await decodeBytesFromJpegBytes(jpegBytes, cryptoOptions);
    expect(decoded).toEqual(payloadBytes);
  }, 180_000);

  it("round-trips with Ghost password (no gcmwrap double-encrypt)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const {
      encodeBytesIntoJpegBytes,
      decodeBytesFromJpegBytes,
    } = await import("../src/payload/codec.js");

    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const coverJpeg = new Uint8Array(
      readFileSync(join(fixtureDirectory, "fixtures/cover_320x240.jpg")),
    );
    const payloadBytes = new TextEncoder().encode("password ghost wish");
    const { jpegBytes } = await encodeBytesIntoJpegBytes(coverJpeg, payloadBytes, {
      stegoPassphrase: "ghost-pass",
      password: "ghost-pass",
    });
    const { payloadBytes: decoded } = await decodeBytesFromJpegBytes(jpegBytes, {
      stegoPassphrase: "ghost-pass",
      password: "ghost-pass",
    });
    expect(decoded).toEqual(payloadBytes);
  }, 180_000);
});
