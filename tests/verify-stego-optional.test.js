/** Vitest: verifyStegoPresence=false fixed channels (PNG + JPEG raw Ghost). */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeBytesFromImageData,
  decodeBytesFromJpegBytes,
  encodeBytesIntoImageData,
  encodeBytesIntoJpegBytes,
  packIntoFixedLengthContainer,
  unpackFromFixedLengthContainer,
} from "../src/payload/codec.js";
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

describe("fixed-length container pack/unpack", () => {
  it("round-trips ciphertext and pads to profile length", () => {
    const ciphertext = new Uint8Array([1, 2, 3, 4, 5]);
    const packed = packIntoFixedLengthContainer(ciphertext, 256);
    expect(packed.length).toBe(256);
    expect(unpackFromFixedLengthContainer(packed)).toEqual(ciphertext);
  });

  it("returns null for nonsense length prefixes", () => {
    const packed = new Uint8Array(256);
    packed[0] = 0xff;
    packed[1] = 0xff;
    packed[2] = 0xff;
    packed[3] = 0xff;
    expect(unpackFromFixedLengthContainer(packed)).toBeNull();
  });
});

describe("PNG verifyStegoPresence=false", () => {
  it("round-trips password payload through a fixed channel", async () => {
    const imageData = makeNoiseImageData(384, 480);
    const payloadBytes = new TextEncoder().encode("fixed-channel secret");
    const cryptoOptions = {
      stegoPassphrase: "weak-shared",
      password: "weak-shared",
      verifyStegoPresence: false,
    };
    const { embeddedByteCount, fixedProfileLength } = await encodeBytesIntoImageData(
      imageData,
      payloadBytes,
      cryptoOptions,
    );
    expect(fixedProfileLength).toBeGreaterThanOrEqual(256);
    expect(embeddedByteCount).toBe(fixedProfileLength);
    const { payloadBytes: decoded } = await decodeBytesFromImageData(imageData, cryptoOptions);
    expect(decoded).toEqual(payloadBytes);
  }, 120_000);

  it("extracts a full profile from a clean cover without stego auth errors", async () => {
    const cleanImage = makeNoiseImageData(384, 480);
    const cryptoOptions = {
      stegoPassphrase: "weak-shared",
      password: "weak-shared",
      verifyStegoPresence: false,
    };
    await expect(decodeBytesFromImageData(cleanImage, cryptoOptions)).rejects.toThrow(
      /не удалось расшифровать паролем/,
    );
  }, 120_000);

  it("wrong stego passphrase yields decrypt failure, not invalid-length stego error", async () => {
    const imageData = makeNoiseImageData(384, 480);
    const payloadBytes = new TextEncoder().encode("presence-oracle check");
    await encodeBytesIntoImageData(imageData, payloadBytes, {
      stegoPassphrase: "correct-channel",
      password: "correct-channel",
      verifyStegoPresence: false,
    });
    await expect(
      decodeBytesFromImageData(imageData, {
        stegoPassphrase: "wrong-channel",
        password: "wrong-channel",
        verifyStegoPresence: false,
      }),
    ).rejects.toThrow(/не удалось расшифровать паролем/);
  }, 120_000);
});

describe("JPEG verifyStegoPresence=false (raw Ghost)", () => {
  it("round-trips through ghost_embed_raw / ghost_extract_raw", async () => {
    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const coverJpeg = new Uint8Array(
      readFileSync(join(fixtureDirectory, "fixtures/cover_320x240.jpg")),
    );
    const payloadBytes = new TextEncoder().encode("raw ghost");
    const cryptoOptions = {
      stegoPassphrase: "jpeg-raw-pass",
      password: "jpeg-raw-pass",
      verifyStegoPresence: false,
    };
    const { jpegBytes, fixedProfileLength } = await encodeBytesIntoJpegBytes(
      coverJpeg,
      payloadBytes,
      cryptoOptions,
    );
    expect(fixedProfileLength).toBe(256);
    const { payloadBytes: decoded } = await decodeBytesFromJpegBytes(jpegBytes, cryptoOptions);
    expect(decoded).toEqual(payloadBytes);
  }, 180_000);

  it("clean cover extract does not raise Ghost DECRYPTION_FAILED", async () => {
    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const coverJpeg = new Uint8Array(
      readFileSync(join(fixtureDirectory, "fixtures/cover_320x240.jpg")),
    );
    await expect(
      decodeBytesFromJpegBytes(coverJpeg, {
        stegoPassphrase: "jpeg-raw-pass",
        password: "jpeg-raw-pass",
        verifyStegoPresence: false,
      }),
    ).rejects.toThrow(/не удалось расшифровать паролем/);
  }, 180_000);

  it("verify-on still fails closed on wrong Ghost passphrase", async () => {
    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const coverJpeg = new Uint8Array(
      readFileSync(join(fixtureDirectory, "fixtures/cover_320x240.jpg")),
    );
    const payloadBytes = new TextEncoder().encode("verify-on ghost");
    const { jpegBytes } = await encodeBytesIntoJpegBytes(coverJpeg, payloadBytes, {
      stegoPassphrase: "ghost-pass",
      password: "ghost-pass",
      verifyStegoPresence: true,
    });
    await expect(
      decodeBytesFromJpegBytes(jpegBytes, {
        stegoPassphrase: "wrong-pass",
        password: "wrong-pass",
        verifyStegoPresence: true,
      }),
    ).rejects.toThrow(/DECRYPTION_FAILED|Wrong passphrase|не удалось|FrameCorrupted|FRAME_CORRUPTED/i);
  }, 180_000);
});
