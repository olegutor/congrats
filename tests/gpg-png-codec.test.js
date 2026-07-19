/** Integration tests for markerless fixed-profile GPG containers in PNG pixels. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as openpgp from "openpgp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeImageDataToBinaryGpgMessage,
  encodeBytesIntoImageData,
  selectGpgProfileForImage,
} from "../src/payload/codec.js";

/** @type {string} */
let g_publicKeyArmored;

beforeAll(() => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  g_publicKeyArmored = readFileSync(join(testDirectory, "../test_rsa3072.pub"), "utf8");
});

/**
 * Create deterministic textured RGBA pixels.
 *
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
function createTestImageData(width, height) {
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  for (let byteOffset = 0; byteOffset < rgbaData.length; byteOffset += 4) {
    // Loop invariant: all pixels before byteOffset contain deterministic opaque RGB values.
    rgbaData[byteOffset] = (byteOffset * 17) & 255;
    rgbaData[byteOffset + 1] = (byteOffset * 31) & 255;
    rgbaData[byteOffset + 2] = (byteOffset * 47) & 255;
    rgbaData[byteOffset + 3] = 255;
  }
  return { width, height, data: rgbaData, colorSpace: "srgb" };
}

describe("PNG fixed GPG codec", () => {
  it("selects profiles only from cover capacity", () => {
    expect(selectGpgProfileForImage(384, 480).embeddedLength).toBe(4096);
    expect(selectGpgProfileForImage(540, 675).embeddedLength).toBe(8192);
    expect(selectGpgProfileForImage(1080, 1350).embeddedLength).toBe(32768);
  });

  it("round-trips a standard parseable PGP message without a stego passphrase", async () => {
    const imageData = createTestImageData(200, 250);
    const payloadBytes = new TextEncoder().encode("public-key PNG payload");
    const encodeResult = await encodeBytesIntoImageData(imageData, payloadBytes, {
      publicKeyArmored: g_publicKeyArmored,
    });
    const profile = selectGpgProfileForImage(imageData.width, imageData.height);
    expect(encodeResult.embeddedByteCount).toBe(profile.embeddedLength);

    const { embeddedBytes, binaryPgpMessage } = await decodeImageDataToBinaryGpgMessage(
      imageData,
      g_publicKeyArmored,
    );
    expect(embeddedBytes).toHaveLength(profile.embeddedLength);
    const parsedMessage = await openpgp.readMessage({ binaryMessage: binaryPgpMessage });
    expect(parsedMessage.packets).toHaveLength(2);
  }, 30_000);
});
