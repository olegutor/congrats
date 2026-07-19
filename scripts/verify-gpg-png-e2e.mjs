#!/usr/bin/env node

/**
 * End-to-end check: PNG fixed GPG embed → rebuild .pgp → external gpg --decrypt.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  decodeImageDataToBinaryGpgMessage,
  encodeBytesIntoImageData,
  selectGpgProfileForImage,
} from "../src/payload/codec.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_KEY_PATH = join(REPOSITORY_ROOT, "test_rsa3072.pub");
const CARD_SIZES = Object.freeze([
  Object.freeze({ id: "compact", width: 384, height: 480, expectedEmbeddedLength: 4096 }),
  Object.freeze({ id: "medium", width: 540, height: 675, expectedEmbeddedLength: 8192 }),
  Object.freeze({ id: "full", width: 1080, height: 1350, expectedEmbeddedLength: 32768 }),
]);

/**
 * Create deterministic textured RGBA pixels.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} seed
 * @returns {ImageData}
 */
function createTexturedImageData(width, height, seed) {
  assert(Number.isSafeInteger(width) && width > 0, `expected positive width, got ${width}`);
  assert(Number.isSafeInteger(height) && height > 0, `expected positive height, got ${height}`);
  assert(Number.isSafeInteger(seed), `expected safe integer seed, got ${seed}`);
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  let generatorState = seed >>> 0;
  for (let byteOffset = 0; byteOffset < rgbaData.length; byteOffset += 4) {
    // Loop invariant: pixels before byteOffset are filled from the xorshift stream.
    generatorState ^= generatorState << 13;
    generatorState ^= generatorState >>> 17;
    generatorState ^= generatorState << 5;
    rgbaData[byteOffset] = generatorState & 255;
    rgbaData[byteOffset + 1] = (generatorState >>> 8) & 255;
    rgbaData[byteOffset + 2] = (generatorState >>> 16) & 255;
    rgbaData[byteOffset + 3] = 255;
  }
  return { width, height, data: rgbaData, colorSpace: "srgb" };
}

/**
 * Invoke a command and fail with its complete diagnostic output.
 *
 * side-effects: starts a child process
 *
 * @param {string} command
 * @param {string[]} argumentsList
 * @returns {void}
 */
function runChecked(command, argumentsList) {
  const commandResult = spawnSync(command, argumentsList, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  assert.equal(
    commandResult.status,
    0,
    `expected ${command} exit 0, got ${commandResult.status}\n${commandResult.stderr}`,
  );
}

/**
 * Encode, extract, rebuild, and externally decrypt one card size.
 *
 * side-effects: consumes randomness, writes temporary files, invokes GnuPG
 *
 * @param {{id: string, width: number, height: number, expectedEmbeddedLength: number}} cardSize
 * @param {string} publicKeyArmored
 * @param {string} temporaryDirectory
 * @returns {Promise<object>}
 */
async function verifyCardSize(cardSize, publicKeyArmored, temporaryDirectory) {
  const profile = selectGpgProfileForImage(cardSize.width, cardSize.height);
  assert.equal(
    profile.embeddedLength,
    cardSize.expectedEmbeddedLength,
    `expected ${cardSize.id} profile ${cardSize.expectedEmbeddedLength}, got ${profile.embeddedLength}`,
  );
  const payloadBytes = new TextEncoder().encode(
    `congrats-steg PNG e2e card=${cardSize.id} profile=${profile.embeddedLength}`,
  );
  assert(
    payloadBytes.length <= profile.maxPayloadLength,
    `expected payload <= ${profile.maxPayloadLength}, got ${payloadBytes.length}`,
  );
  const imageData = createTexturedImageData(
    cardSize.width,
    cardSize.height,
    0xc0ffee00 ^ cardSize.expectedEmbeddedLength,
  );
  const encodeResult = await encodeBytesIntoImageData(imageData, payloadBytes, {
    publicKeyArmored,
  });
  assert.equal(
    encodeResult.embeddedByteCount,
    profile.embeddedLength,
    `expected embedded ${profile.embeddedLength}, got ${encodeResult.embeddedByteCount}`,
  );
  const { binaryPgpMessage, embeddedBytes } = await decodeImageDataToBinaryGpgMessage(
    imageData,
    publicKeyArmored,
  );
  assert.equal(
    embeddedBytes.length,
    profile.embeddedLength,
    `expected extracted container ${profile.embeddedLength}, got ${embeddedBytes.length}`,
  );
  const pgpPath = join(temporaryDirectory, `${cardSize.id}.pgp`);
  const decryptedPath = join(temporaryDirectory, `${cardSize.id}.payload`);
  writeFileSync(pgpPath, binaryPgpMessage);
  runChecked("gpg", ["--batch", "--yes", "--output", decryptedPath, "--decrypt", pgpPath]);
  const decryptedBytes = new Uint8Array(readFileSync(decryptedPath));
  assert.deepEqual(
    decryptedBytes,
    payloadBytes,
    `expected byte-identical payload for ${cardSize.id}`,
  );
  return {
    cardId: cardSize.id,
    width: cardSize.width,
    height: cardSize.height,
    embeddedLength: profile.embeddedLength,
    maxPayloadLength: profile.maxPayloadLength,
    payloadLength: payloadBytes.length,
    pgpLength: binaryPgpMessage.length,
    changedCount: encodeResult.stegoStats.changedCount,
    embeddingRate: encodeResult.stegoStats.embeddingRate,
  };
}

/**
 * Run every postcard size through the production PNG GPG path.
 *
 * side-effects: creates and removes a temporary directory, invokes GnuPG
 *
 * @returns {Promise<void>}
 */
async function main() {
  assert.equal(
    process.cwd(),
    REPOSITORY_ROOT,
    `expected current directory ${REPOSITORY_ROOT}, got ${process.cwd()}`,
  );
  const publicKeyArmored = readFileSync(PUBLIC_KEY_PATH, "utf8");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "congrats-steg-gpg-png-"));
  /** @type {object[]} */
  const verificationCases = [];
  try {
    for (const cardSize of CARD_SIZES) {
      // Loop invariant: every previous card size passed external GnuPG decryption.
      verificationCases.push(
        await verifyCardSize(cardSize, publicKeyArmored, temporaryDirectory),
      );
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify({ verified: true, verificationCases }, null, 2)}\n`);
}

await main();
