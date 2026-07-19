#!/usr/bin/env node

/** Verify the production stripped container against the external GnuPG secret key. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  encryptGpgContainer,
  rebuildGpgContainerMessage,
} from "../src/crypto/gpg-container.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_KEY_PATH = join(REPOSITORY_ROOT, "test_rsa3072.pub");
const PROFILE_LENGTHS_BYTES = Object.freeze([1024, 4096, 8192, 32768]);

/**
 * Invoke a command and fail with its complete diagnostic output.
 *
 * side-effects: starts a child process.
 *
 * @param {string} command
 * @param {string[]} argumentsList shape (argumentCount,)
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
 * Encrypt, rebuild, externally decrypt, and compare one fixed profile.
 *
 * side-effects: consumes randomness, writes temporary files, invokes GnuPG.
 *
 * @param {number} profileLengthBytes
 * @param {string} publicKeyArmored
 * @param {string} temporaryDirectory
 * @returns {Promise<{profileLengthBytes: number, pgpLengthBytes: number}>}
 */
async function verifyProfile(profileLengthBytes, publicKeyArmored, temporaryDirectory) {
  const payloadBytes = new TextEncoder().encode(
    `congrats-steg external GnuPG verification profile=${profileLengthBytes}`,
  );
  const { embeddedBytes } = await encryptGpgContainer(
    payloadBytes,
    publicKeyArmored,
    profileLengthBytes,
  );
  const binaryPgpMessage = await rebuildGpgContainerMessage(
    embeddedBytes,
    publicKeyArmored,
    profileLengthBytes,
  );
  const pgpPath = join(temporaryDirectory, `${profileLengthBytes}.pgp`);
  const decryptedPath = join(temporaryDirectory, `${profileLengthBytes}.payload`);
  writeFileSync(pgpPath, binaryPgpMessage);
  runChecked("gpg", ["--batch", "--yes", "--output", decryptedPath, "--decrypt", pgpPath]);
  const decryptedBytes = new Uint8Array(readFileSync(decryptedPath));
  assert.deepEqual(
    decryptedBytes,
    payloadBytes,
    `expected byte-identical payload for profile ${profileLengthBytes}, got mismatch`,
  );
  return { profileLengthBytes, pgpLengthBytes: binaryPgpMessage.length };
}

/**
 * Run all production-profile checks.
 *
 * side-effects: creates and removes a temporary directory, invokes GnuPG.
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
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "congrats-steg-gpg-"));
  const verificationCases = [];
  try {
    for (const profileLengthBytes of PROFILE_LENGTHS_BYTES) {
      // Loop invariant: every previous profile passed external GnuPG decryption.
      verificationCases.push(
        await verifyProfile(profileLengthBytes, publicKeyArmored, temporaryDirectory),
      );
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify({ verified: true, verificationCases }, null, 2)}\n`);
}

await main();
