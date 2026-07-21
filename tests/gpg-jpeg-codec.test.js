/** Integration tests for markerless fixed-profile GPG containers in JPEG Ghost raw. */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as openpgp from "openpgp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeJpegBytesToBinaryGpgMessage,
  encodeBytesIntoJpegBytes,
  estimateJpegGhostRawCapacityBytes,
  selectGpgProfileForCapacityBytes,
} from "../src/payload/codec.js";
import { setPhasmWasmInitOverride } from "../src/stego/jpeg-phasm.js";
import initPhasmWasm from "../vendor/phasm/congrats_phasm_wasm.js";

/** @type {string} */
let g_publicKeyArmored;

/** @type {Uint8Array} */
let g_coverJpegBytes;

beforeAll(async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  g_publicKeyArmored = readFileSync(join(testDirectory, "../test_rsa3072.pub"), "utf8");
  const wasmBytes = readFileSync(
    join(testDirectory, "../vendor/phasm/congrats_phasm_wasm_bg.wasm"),
  );
  setPhasmWasmInitOverride(async () => {
    await initPhasmWasm({ module_or_path: wasmBytes });
  });

  const coverPath = join(testDirectory, "fixtures/cover_gpg_540x675.jpg");
  if (!existsSync(coverPath)) {
    try {
      execFileSync(
        "convert",
        ["-size", "540x675", "plasma:fractal", "-quality", "85", coverPath],
        { stdio: "pipe" },
      );
    } catch {
      copyFileSync("/tmp/noise_540x675.jpg", coverPath);
    }
  }
  g_coverJpegBytes = new Uint8Array(readFileSync(coverPath));
});

describe("JPEG fixed GPG codec", () => {
  it("selects a GPG profile from raw Ghost capacity", async () => {
    const capacityBytes = await estimateJpegGhostRawCapacityBytes(g_coverJpegBytes);
    expect(capacityBytes).toBeGreaterThanOrEqual(1024);
    const profile = selectGpgProfileForCapacityBytes(capacityBytes);
    expect(profile.embeddedLength).toBeGreaterThanOrEqual(1024);
    expect(profile.embeddedLength).toBeLessThanOrEqual(capacityBytes);
  }, 60_000);

  it("round-trips a standard parseable PGP message without a stego passphrase", async () => {
    const payloadBytes = new TextEncoder().encode("public-key JPEG payload");
    const encodeResult = await encodeBytesIntoJpegBytes(g_coverJpegBytes, payloadBytes, {
      publicKeyArmored: g_publicKeyArmored,
    });
    expect(encodeResult.fixedProfileLength).toBeGreaterThanOrEqual(1024);
    expect(encodeResult.embeddedByteCount).toBe(encodeResult.fixedProfileLength);

    const { embeddedBytes, binaryPgpMessage, profile } = await decodeJpegBytesToBinaryGpgMessage(
      encodeResult.jpegBytes,
      g_publicKeyArmored,
    );
    expect(embeddedBytes).toHaveLength(profile.embeddedLength);
    expect(profile.embeddedLength).toBe(encodeResult.fixedProfileLength);
    const parsedMessage = await openpgp.readMessage({ binaryMessage: binaryPgpMessage });
    expect(parsedMessage.packets).toHaveLength(2);
  }, 180_000);
});
