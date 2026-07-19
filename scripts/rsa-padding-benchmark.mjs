#!/usr/bin/env node

/**
 * Compare three exact-size padding layouts for RSA-3072 OpenPGP ciphertexts.
 *
 * Reproducible payload bytes are generated from a fixed xorshift32 seed.
 * OpenPGP encryption itself intentionally uses cryptographically secure random
 * session keys and PKCS#1 padding, so ciphertext bytes differ between runs
 * while their lengths remain invariant.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, freemem, homedir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import process from "node:process";
import * as openpgp from "openpgp";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const PUBLIC_KEY_PATH = join(REPOSITORY_ROOT, "test_rsa3072.pub");
const BENCHMARK_DIRECTORY = join(REPOSITORY_ROOT, "benchmarks", "rsa-padding");
const ARTIFACT_DIRECTORY = join(BENCHMARK_DIRECTORY, "artifacts");
const TEMP_DIRECTORY = join(BENCHMARK_DIRECTORY, ".tmp");
const RESULT_PATH = join(BENCHMARK_DIRECTORY, "results.json");
const REPORT_PATH = join(BENCHMARK_DIRECTORY, "report.md");
const TARGET_SIZES_BYTES = [1024, 2048, 4096, 8192, 16384, 32768];
const BENCHMARK_ITERATIONS = 5;
const PAYLOAD_LENGTH_BYTES = 256;
const PAYLOAD_SEED = 0x5eed3072;
const PADDING_SEED = 0x95803072;
const FIXED_PACKET_DATE = new Date(0);
const EXPECTED_ENCRYPTION_SUBKEY_FINGERPRINT = "2F976DF8ED92486BCBF11C4BC442F831C422D798";
const OPENPGP_CONFIG = {
  aeadProtect: false,
  preferredCompressionAlgorithm: openpgp.enums.compression.uncompressed,
  preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
};
const VARIANTS = [
  {
    id: "openpgp-padding-packet",
    title: "Literal Data + RFC 9580 Padding Packet",
  },
  {
    id: "zip-eocd-comment",
    title: "ZIP stored payload + EOCD comment padding",
  },
  {
    id: "zip-padding-entry",
    title: "ZIP stored payload + stored padding entry",
  },
];

/**
 * Return deterministic pseudo-random bytes.
 *
 * @param {number} byteLength shape ()
 * @param {number} seed shape ()
 * @returns {Uint8Array} shape (byteLength,)
 */
function createDeterministicBytes(byteLength, seed) {
  assert(Number.isSafeInteger(byteLength) && byteLength >= 0,
    `expected non-negative safe byteLength, got ${byteLength}`);
  assert(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff,
    `expected uint32 seed, got ${seed}`);
  const generatedBytes = new Uint8Array(byteLength);
  let generatorState = seed >>> 0;
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    // Loop invariant: generatedBytes[0:byteIndex] is fixed by seed and xorshift32.
    generatorState ^= generatorState << 13;
    generatorState ^= generatorState >>> 17;
    generatorState ^= generatorState << 5;
    generatedBytes[byteIndex] = generatorState & 0xff;
  }
  return generatedBytes;
}

/**
 * Calculate standard ZIP CRC-32.
 *
 * @param {Uint8Array} inputBytes shape (inputLength,)
 * @returns {number} shape ()
 */
function calculateCrc32(inputBytes) {
  assert(inputBytes instanceof Uint8Array,
    `expected Uint8Array inputBytes, got ${Object.prototype.toString.call(inputBytes)}`);
  let checksum = 0xffffffff;
  for (const inputByte of inputBytes) {
    // Loop invariant: checksum covers every byte visited so far.
    checksum ^= inputByte;
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      checksum = (checksum >>> 1) ^ (0xedb88320 & -(checksum & 1));
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

/**
 * Concatenate byte arrays.
 *
 * @param {Uint8Array[]} byteArrays shapes [(length_0,), ...]
 * @returns {Uint8Array} shape (sum(length_i),)
 */
function concatenateBytes(byteArrays) {
  assert(Array.isArray(byteArrays), `expected byteArrays array, got ${typeof byteArrays}`);
  const totalLength = byteArrays.reduce((sum, bytes) => sum + bytes.length, 0);
  const concatenatedBytes = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const bytes of byteArrays) {
    assert(bytes instanceof Uint8Array,
      `expected Uint8Array element, got ${Object.prototype.toString.call(bytes)}`);
    concatenatedBytes.set(bytes, writeOffset);
    writeOffset += bytes.length;
  }
  assert.equal(writeOffset, totalLength,
    `expected writeOffset ${totalLength}, got ${writeOffset}`);
  return concatenatedBytes;
}

/**
 * Encode a deterministic non-ZIP64 stored ZIP archive.
 *
 * @param {{name: string, data: Uint8Array}[]} entries shapes data (entryLength,)
 * @param {Uint8Array} commentBytes shape (commentLength,)
 * @returns {Uint8Array} shape (archiveLength,)
 */
function createStoredZip(entries, commentBytes) {
  assert(Array.isArray(entries) && entries.length > 0 && entries.length <= 0xffff,
    `expected 1..65535 entries, got ${entries.length}`);
  assert(commentBytes instanceof Uint8Array && commentBytes.length <= 0xffff,
    `expected ZIP comment up to 65535 bytes, got ${commentBytes.length}`);
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const localParts = [];
  /** @type {Uint8Array[]} */
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    assert(entry.data instanceof Uint8Array,
      `expected Uint8Array entry.data, got ${Object.prototype.toString.call(entry.data)}`);
    const nameBytes = encoder.encode(entry.name);
    assert(nameBytes.length > 0 && nameBytes.length <= 0xffff,
      `expected UTF-8 entry name length 1..65535, got ${nameBytes.length}`);
    assert(entry.data.length <= 0xffffffff,
      `expected non-ZIP64 entry length <= 4294967295, got ${entry.data.length}`);
    const checksum = calculateCrc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  }
  const centralDirectory = concatenateBytes(centralParts);
  const endRecord = new Uint8Array(22 + commentBytes.length);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, commentBytes.length, true);
  endRecord.set(commentBytes, 22);
  return concatenateBytes([...localParts, centralDirectory, endRecord]);
}

/**
 * Build an unencrypted OpenPGP message for one padding variant.
 *
 * @param {string} variantId shape ()
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {number} paddingLength shape ()
 * @returns {Promise<{message: openpgp.Message<Uint8Array>, decryptedBytes: Uint8Array, archiveBytes: Uint8Array | null}>}
 */
async function createVariantMessage(variantId, payloadBytes, paddingLength) {
  assert(VARIANTS.some((variant) => variant.id === variantId),
    `expected known variantId, got ${variantId}`);
  assert(Number.isSafeInteger(paddingLength) && paddingLength >= 0,
    `expected non-negative safe paddingLength, got ${paddingLength}`);
  const paddingBytes = createDeterministicBytes(
    paddingLength,
    (PADDING_SEED ^ paddingLength) >>> 0,
  );
  if (variantId === "openpgp-padding-packet") {
    const literalPacket = new openpgp.LiteralDataPacket(FIXED_PACKET_DATE);
    literalPacket.setBytes(payloadBytes, openpgp.enums.literal.binary);
    literalPacket.setFilename("payload.bin");
    const paddingPacket = new openpgp.PaddingPacket();
    paddingPacket.padding = paddingBytes;
    const packetList = new openpgp.PacketList(literalPacket, paddingPacket);
    return {
      message: new openpgp.Message(packetList),
      decryptedBytes: payloadBytes,
      archiveBytes: null,
    };
  }
  const archiveBytes = variantId === "zip-eocd-comment"
    ? createStoredZip([{ name: "payload.bin", data: payloadBytes }], paddingBytes)
    : createStoredZip([
      { name: "payload.bin", data: payloadBytes },
      { name: "padding.bin", data: paddingBytes },
    ], new Uint8Array());
  const literalPacket = new openpgp.LiteralDataPacket(FIXED_PACKET_DATE);
  literalPacket.setBytes(archiveBytes, openpgp.enums.literal.binary);
  literalPacket.setFilename("payload.zip");
  return {
    message: new openpgp.Message(new openpgp.PacketList(literalPacket)),
    decryptedBytes: archiveBytes,
    archiveBytes,
  };
}

/**
 * Encrypt one variant using the supplied public key.
 *
 * @param {string} variantId shape ()
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {number} paddingLength shape ()
 * @param {openpgp.PublicKey} publicKey shape ()
 * @returns {Promise<{ciphertextBytes: Uint8Array, decryptedBytes: Uint8Array, archiveBytes: Uint8Array | null}>}
 */
async function encryptVariant(variantId, payloadBytes, paddingLength, publicKey) {
  const variantMessage = await createVariantMessage(variantId, payloadBytes, paddingLength);
  const encryptedMessage = await variantMessage.message.encrypt(
    [publicKey],
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    OPENPGP_CONFIG,
  );
  const ciphertextBytes = encryptedMessage.write();
  assert(ciphertextBytes instanceof Uint8Array,
    `expected Uint8Array ciphertext, got ${Object.prototype.toString.call(ciphertextBytes)}`);
  return { ...variantMessage, ciphertextBytes };
}

/**
 * Encrypt repeatedly, correcting padding until ciphertext is exactly sized.
 *
 * @param {string} variantId shape ()
 * @param {number} targetSizeBytes shape ()
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {number} initialPaddingLength shape ()
 * @param {openpgp.PublicKey} publicKey shape ()
 * @returns {Promise<Awaited<ReturnType<typeof encryptVariant>> & {paddingLength: number, exactSizingAttempts: number}>}
 */
async function encryptVariantExactly(
  variantId,
  targetSizeBytes,
  payloadBytes,
  initialPaddingLength,
  publicKey,
) {
  let paddingLength = initialPaddingLength;
  for (let attemptIndex = 0; attemptIndex < 12; attemptIndex += 1) {
    const encryptedVariant = await encryptVariant(
      variantId,
      payloadBytes,
      paddingLength,
      publicKey,
    );
    const sizeDifference = targetSizeBytes - encryptedVariant.ciphertextBytes.length;
    if (sizeDifference === 0) {
      return {
        ...encryptedVariant,
        paddingLength,
        exactSizingAttempts: attemptIndex + 1,
      };
    }
    assert(paddingLength + sizeDifference >= 0,
      `expected target ${targetSizeBytes} to fit ${variantId}, got ${encryptedVariant.ciphertextBytes.length}`);
    paddingLength += sizeDifference;
    if (variantId === "zip-eocd-comment") {
      assert(paddingLength <= 0xffff,
        `expected EOCD comment <= 65535 bytes, got ${paddingLength}`);
    }
  }
  throw new Error(`failed exact encryption of ${variantId} to ${targetSizeBytes} bytes in 12 attempts`);
}

/**
 * Find the padding body length that yields an exact ciphertext length.
 *
 * @param {string} variantId shape ()
 * @param {number} targetSizeBytes shape ()
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {openpgp.PublicKey} publicKey shape ()
 * @returns {Promise<{paddingLength: number, calibrationEncryptions: number}>}
 */
async function calibratePaddingLength(variantId, targetSizeBytes, payloadBytes, publicKey) {
  assert(Number.isSafeInteger(targetSizeBytes) && targetSizeBytes > 0,
    `expected positive safe targetSizeBytes, got ${targetSizeBytes}`);
  let paddingLength = 0;
  for (let calibrationIndex = 0; calibrationIndex < 12; calibrationIndex += 1) {
    const encryptedVariant = await encryptVariant(
      variantId,
      payloadBytes,
      paddingLength,
      publicKey,
    );
    const sizeDifference = targetSizeBytes - encryptedVariant.ciphertextBytes.length;
    if (sizeDifference === 0) {
      return { paddingLength, calibrationEncryptions: calibrationIndex + 1 };
    }
    assert(paddingLength + sizeDifference >= 0,
      `expected target ${targetSizeBytes} to fit ${variantId}, got minimum ${encryptedVariant.ciphertextBytes.length}`);
    paddingLength += sizeDifference;
    if (variantId === "zip-eocd-comment") {
      assert(paddingLength <= 0xffff,
        `expected EOCD comment <= 65535 bytes, got ${paddingLength}`);
    }
  }
  throw new Error(`failed to calibrate ${variantId} to ${targetSizeBytes} bytes in 12 encryptions`);
}

/**
 * Execute a command and require a zero exit status.
 *
 * side-effects: starts a subprocess.
 *
 * @param {string} command shape ()
 * @param {string[]} argumentsList shape (argumentCount,)
 * @param {{encoding?: BufferEncoding, env?: NodeJS.ProcessEnv}} options shape ()
 * @returns {string | Buffer} shape ()
 */
function runChecked(command, argumentsList, options = {}) {
  const commandResult = spawnSync(command, argumentsList, {
    cwd: REPOSITORY_ROOT,
    encoding: options.encoding,
    env: options.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(commandResult.status, 0,
    `expected zero status from ${command} ${argumentsList.join(" ")}, got ${commandResult.status}: ${commandResult.stderr}`);
  return commandResult.stdout;
}

/**
 * Return command output or an explicit unavailable marker.
 *
 * side-effects: starts a subprocess.
 *
 * @param {string} command shape ()
 * @param {string[]} argumentsList shape (argumentCount,)
 * @returns {string} shape ()
 */
function readOptionalCommand(command, argumentsList) {
  const commandResult = spawnSync(command, argumentsList, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (commandResult.status !== 0) {
    return `unavailable (exit ${commandResult.status ?? "spawn-error"})`;
  }
  return commandResult.stdout.trim();
}

/**
 * Return SHA-256 hex digest.
 *
 * @param {Uint8Array} inputBytes shape (inputLength,)
 * @returns {string} shape ()
 */
function sha256Hex(inputBytes) {
  assert(inputBytes instanceof Uint8Array,
    `expected Uint8Array inputBytes, got ${Object.prototype.toString.call(inputBytes)}`);
  return createHash("sha256").update(inputBytes).digest("hex");
}

/**
 * Calculate basic timing statistics.
 *
 * @param {number[]} timingMilliseconds shape (sampleCount,)
 * @returns {{minimumMs: number, medianMs: number, meanMs: number, maximumMs: number, samplesMs: number[]}}
 */
function summarizeTimings(timingMilliseconds) {
  assert(Array.isArray(timingMilliseconds) && timingMilliseconds.length > 0,
    `expected non-empty timing array, got length ${timingMilliseconds.length}`);
  const sortedTimings = [...timingMilliseconds].sort((left, right) => left - right);
  const meanMs = sortedTimings.reduce((sum, timing) => sum + timing, 0) / sortedTimings.length;
  return {
    minimumMs: sortedTimings[0],
    medianMs: sortedTimings[Math.floor(sortedTimings.length / 2)],
    meanMs,
    maximumMs: sortedTimings.at(-1),
    samplesMs: timingMilliseconds,
  };
}

/**
 * Validate one ciphertext with OpenPGP.js, GnuPG, and unzip when applicable.
 *
 * side-effects: writes validation files and starts subprocesses.
 *
 * @param {string} variantId shape ()
 * @param {number} targetSizeBytes shape ()
 * @param {Uint8Array} ciphertextBytes shape (targetSizeBytes,)
 * @param {Uint8Array} expectedDecryptedBytes shape (decryptedLength,)
 * @param {Uint8Array} payloadBytes shape (payloadLength,)
 * @param {number} paddingLength shape ()
 * @returns {Promise<{openpgpPacketClasses: string[], gpgPacketListingPath: string, gpgDecryptTiming: ReturnType<typeof summarizeTimings>, gpgPeakRssKiBMax: number, gpgPeakRssKiBSamples: number[], unzipTested: boolean}>}
 */
async function validateCiphertext(
  variantId,
  targetSizeBytes,
  ciphertextBytes,
  expectedDecryptedBytes,
  payloadBytes,
  paddingLength,
) {
  assert.equal(ciphertextBytes.length, targetSizeBytes,
    `expected exact ciphertext size ${targetSizeBytes}, got ${ciphertextBytes.length}`);
  const artifactStem = `${variantId}-${targetSizeBytes}`;
  const ciphertextPath = join(ARTIFACT_DIRECTORY, `${artifactStem}.pgp`);
  const decryptedPath = join(TEMP_DIRECTORY, `${artifactStem}.decrypted`);
  const timingPath = join(TEMP_DIRECTORY, `${artifactStem}.time`);
  const packetListingPath = join(ARTIFACT_DIRECTORY, `${artifactStem}.packets.txt`);
  writeFileSync(ciphertextPath, ciphertextBytes);
  const parsedMessage = await openpgp.readMessage({ binaryMessage: ciphertextBytes });
  const openpgpPacketClasses = Array.from(
    parsedMessage.packets,
    (packet) => packet.constructor.name,
  );
  const packetListingResult = spawnSync("gpg", ["--batch", "--list-packets", ciphertextPath], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(packetListingResult.status, 0,
    `expected gpg --list-packets status 0, got ${packetListingResult.status}: ${packetListingResult.stderr}`);
  writeFileSync(packetListingPath, `${packetListingResult.stdout}${packetListingResult.stderr}`);
  /** @type {number[]} */
  const gpgDecryptTimingsMs = [];
  /** @type {number[]} */
  const gpgPeakRssKiBSamples = [];
  for (let iterationIndex = 0; iterationIndex < BENCHMARK_ITERATIONS; iterationIndex += 1) {
    const decryptStart = performance.now();
    runChecked("/usr/bin/time", [
      "-f", "wall_seconds=%e\npeak_rss_kib=%M",
      "-o", timingPath,
      "gpg", "--batch", "--yes", "--output", decryptedPath, "--decrypt", ciphertextPath,
    ], { encoding: "utf8" });
    gpgDecryptTimingsMs.push(performance.now() - decryptStart);
    const timingText = readFileSync(timingPath, "utf8");
    const peakMatch = timingText.match(/peak_rss_kib=(\d+)/);
    assert(peakMatch !== null, `expected peak_rss_kib in timing output, got ${timingText}`);
    gpgPeakRssKiBSamples.push(Number.parseInt(peakMatch[1], 10));
  }
  const decryptedBytes = new Uint8Array(readFileSync(decryptedPath));
  assert.deepEqual(decryptedBytes, expectedDecryptedBytes,
    `expected byte-identical gpg decryption for ${artifactStem}, got SHA-256 ${sha256Hex(decryptedBytes)}`);
  if (variantId !== "openpgp-padding-packet") {
    runChecked("unzip", ["-t", decryptedPath], { encoding: "utf8" });
    const extractedPayload = new Uint8Array(runChecked(
      "unzip",
      ["-p", decryptedPath, "payload.bin"],
      {},
    ));
    assert.deepEqual(extractedPayload, payloadBytes,
      `expected byte-identical payload.bin for ${artifactStem}, got SHA-256 ${sha256Hex(extractedPayload)}`);
    if (variantId === "zip-padding-entry") {
      const extractedPadding = new Uint8Array(runChecked(
        "unzip",
        ["-p", decryptedPath, "padding.bin"],
        {},
      ));
      assert.equal(extractedPadding.length, paddingLength,
        `expected padding.bin length ${paddingLength}, got ${extractedPadding.length}`);
    }
  }
  return {
    openpgpPacketClasses,
    gpgPacketListingPath: packetListingPath.slice(REPOSITORY_ROOT.length + 1),
    gpgDecryptTiming: summarizeTimings(gpgDecryptTimingsMs),
    gpgPeakRssKiBMax: Math.max(...gpgPeakRssKiBSamples),
    gpgPeakRssKiBSamples,
    unzipTested: variantId !== "openpgp-padding-packet",
  };
}

/**
 * Collect environment metadata needed to reproduce the benchmark.
 *
 * side-effects: starts version-reporting subprocesses.
 *
 * @returns {Record<string, unknown>} shape ()
 */
function collectEnvironment() {
  const packageMetadata = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, "node_modules", "openpgp", "package.json"), "utf8"),
  );
  return {
    capturedAtUtc: new Date().toISOString(),
    osRelease: readOptionalCommand("uname", ["-a"]),
    osReleaseFile: readFileSync("/etc/os-release", "utf8").trim(),
    node: process.version,
    npm: readOptionalCommand("npm", ["--version"]),
    openpgpJs: packageMetadata.version,
    gnupg: readOptionalCommand("gpg", ["--version"]),
    unzip: readOptionalCommand("unzip", ["-v"]),
    chromium: readOptionalCommand("chromium", ["--version"]),
    cpuModel: cpus()[0]?.model ?? "unavailable",
    cpuLogicalCount: cpus().length,
    ramTotalBytes: totalmem(),
    ramFreeAtStartBytes: freemem(),
    nvidiaDriver: readOptionalCommand("nvidia-smi", ["--query-gpu=driver_version", "--format=csv,noheader"]),
    gpu: readOptionalCommand("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]),
    gpuVramPeak: "unavailable/not used (CPU-only benchmark)",
  };
}

/**
 * Format a compact Markdown report.
 *
 * @param {Record<string, any>} benchmarkResults shape ()
 * @returns {string} shape ()
 */
function createMarkdownReport(benchmarkResults) {
  const resultLines = benchmarkResults.cases.map((benchmarkCase) => (
    `| ${benchmarkCase.variantId} | ${benchmarkCase.targetSizeBytes} | `
    + `${Math.min(...benchmarkCase.paddingLengthSamples)}–${Math.max(...benchmarkCase.paddingLengthSamples)} | `
    + `${Math.min(...benchmarkCase.ciphertextOverheadBytesSamples)}–${Math.max(...benchmarkCase.ciphertextOverheadBytesSamples)} | `
    + `${benchmarkCase.encryptTiming.medianMs.toFixed(2)} | `
    + `${benchmarkCase.gpgDecryptTiming.medianMs.toFixed(2)} | ${benchmarkCase.gpgPeakRssKiBMax} | yes | `
    + `${benchmarkCase.unzipTested ? "yes" : "n/a"} |`
  ));
  return `# RSA-3072 fixed-size padding benchmark

Selected: **Literal Data + RFC 9580 Padding Packet inside SEIPD**.

It reaches every target exactly, has the least structural overhead, decrypts
byte-for-byte with GnuPG 2.2.27, and is parsed by OpenPGP.js 6.1.1. GnuPG labels
tag 21 as an unknown packet because this older GnuPG predates RFC 9580, but
correctly skips it and emits the literal payload. The ZIP alternatives are also
compatible, but require an application-level archive layer; the extra padding
entry has the largest fixed overhead. EOCD comments are limited to 65535 bytes.

Exact sizing must be adaptive: RSA PKESK MPI encoding can occasionally be one
byte shorter, so production code must encrypt, check the final length, adjust
padding by the observed delta, and retry. The benchmark records retry counts.

| variant | target B | padding B | ciphertext overhead B | encrypt median ms | gpg decrypt median ms | gpg peak RSS KiB | exact/parse/decrypt | unzip |
|---|---:|---:|---:|---:|---:|---:|---|---|
${resultLines.join("\n")}

Payload: ${PAYLOAD_LENGTH_BYTES} deterministic bytes, SHA-256
\`${benchmarkResults.payloadSha256}\`. Each encryption and GnuPG decryption
timing has ${BENCHMARK_ITERATIONS} samples. Node peak RSS for the complete run:
${benchmarkResults.nodePeakRssKiB} KiB.

## Reproduce

\`\`\`bash
cd ${REPOSITORY_ROOT}
npm install --no-save --package-lock=false openpgp@6.1.1
/usr/bin/time -f 'wall_seconds=%e peak_rss_kib=%M' \\
  node scripts/rsa-padding-benchmark.mjs
\`\`\`

The script uses the public key in \`test_rsa3072.pub\` and the matching secret
key only through the local \`gpg\` process. It never exports or reads private-key
material. Full environment, commands, samples, hashes, and artifact paths are
in \`results.json\`.

The actual primary fingerprint in the supplied public key is
\`${benchmarkResults.parameters.publicKeyFingerprint}\`; the encryption subkey
matches the requested \`${benchmarkResults.parameters.encryptionSubkeyFingerprint}\`.
`;
}

/**
 * Run all benchmark cases and write reports.
 *
 * side-effects: recreates benchmark artifacts, invokes GnuPG/unzip, writes reports.
 *
 * @returns {Promise<void>} shape ()
 */
async function main() {
  const benchmarkStart = performance.now();
  assert.equal(process.cwd(), REPOSITORY_ROOT,
    `expected current directory ${REPOSITORY_ROOT}, got ${process.cwd()}`);
  assert.equal(openpgp.PaddingPacket.tag, openpgp.enums.packet.padding,
    `expected OpenPGP padding tag ${openpgp.enums.packet.padding}, got ${openpgp.PaddingPacket.tag}`);
  rmSync(ARTIFACT_DIRECTORY, { recursive: true, force: true });
  rmSync(TEMP_DIRECTORY, { recursive: true, force: true });
  mkdirSync(ARTIFACT_DIRECTORY, { recursive: true });
  mkdirSync(TEMP_DIRECTORY, { recursive: true });
  const environment = collectEnvironment();
  assert.equal(environment.openpgpJs, "6.1.1",
    `expected OpenPGP.js 6.1.1, got ${environment.openpgpJs}`);
  const publicKeyArmored = readFileSync(PUBLIC_KEY_PATH, "utf8");
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const encryptionKey = await publicKey.getEncryptionKey();
  assert.equal(
    encryptionKey.getFingerprint().toUpperCase(),
    EXPECTED_ENCRYPTION_SUBKEY_FINGERPRINT,
    `expected encryption subkey ${EXPECTED_ENCRYPTION_SUBKEY_FINGERPRINT}, got ${encryptionKey.getFingerprint().toUpperCase()}`,
  );
  const payloadBytes = createDeterministicBytes(PAYLOAD_LENGTH_BYTES, PAYLOAD_SEED);
  /** @type {Record<string, any>[]} */
  const benchmarkCases = [];
  for (const variant of VARIANTS) {
    for (const targetSizeBytes of TARGET_SIZES_BYTES) {
      // Loop invariant: each completed case has exact sizing and passed all validators.
      const calibration = await calibratePaddingLength(
        variant.id,
        targetSizeBytes,
        payloadBytes,
        publicKey,
      );
      /** @type {number[]} */
      const encryptionTimingsMs = [];
      /** @type {number[]} */
      const paddingLengthSamples = [];
      /** @type {number[]} */
      const exactSizingAttemptsSamples = [];
      /** @type {Awaited<ReturnType<typeof encryptVariantExactly>> | null} */
      let retainedEncryption = null;
      for (let iterationIndex = 0; iterationIndex < BENCHMARK_ITERATIONS; iterationIndex += 1) {
        const encryptionStart = performance.now();
        const encryptedVariant = await encryptVariantExactly(
          variant.id,
          targetSizeBytes,
          payloadBytes,
          calibration.paddingLength,
          publicKey,
        );
        encryptionTimingsMs.push(performance.now() - encryptionStart);
        paddingLengthSamples.push(encryptedVariant.paddingLength);
        exactSizingAttemptsSamples.push(encryptedVariant.exactSizingAttempts);
        assert.equal(encryptedVariant.ciphertextBytes.length, targetSizeBytes,
          `expected exact size ${targetSizeBytes}, got ${encryptedVariant.ciphertextBytes.length}`);
        retainedEncryption = encryptedVariant;
      }
      assert(retainedEncryption !== null,
        `expected retained encryption after ${BENCHMARK_ITERATIONS} iterations, got null`);
      const validation = await validateCiphertext(
        variant.id,
        targetSizeBytes,
        retainedEncryption.ciphertextBytes,
        retainedEncryption.decryptedBytes,
        payloadBytes,
        retainedEncryption.paddingLength,
      );
      const unpaddedVariant = await createVariantMessage(variant.id, payloadBytes, 0);
      const structuralOverheadBytes = unpaddedVariant.decryptedBytes.length - payloadBytes.length;
      benchmarkCases.push({
        variantId: variant.id,
        variantTitle: variant.title,
        targetSizeBytes,
        payloadLengthBytes: payloadBytes.length,
        paddingLengthSamples,
        exactSizingAttemptsSamples,
        applicationContainerOverheadBytes: structuralOverheadBytes,
        ciphertextOverheadBytesSamples: paddingLengthSamples.map(
          (paddingLength) => targetSizeBytes - payloadBytes.length - paddingLength,
        ),
        calibrationEncryptions: calibration.calibrationEncryptions,
        ciphertextSha256: sha256Hex(retainedEncryption.ciphertextBytes),
        decryptedSha256: sha256Hex(retainedEncryption.decryptedBytes),
        encryptTiming: summarizeTimings(encryptionTimingsMs),
        ...validation,
      });
      process.stdout.write(`validated ${variant.id} at ${targetSizeBytes} bytes\n`);
    }
  }
  const benchmarkResults = {
    schemaVersion: 1,
    selectedVariant: "openpgp-padding-packet",
    rationale: [
      "Exact at all tested target sizes.",
      "Smallest structural overhead and no application-level archive.",
      "OpenPGP.js 6.1.1 parses all messages.",
      "GnuPG 2.2.27 decrypts byte-for-byte and safely skips RFC 9580 packet tag 21.",
      "Adaptive encrypt-check-adjust retries handle variable RSA PKESK MPI length.",
    ],
    environment,
    parameters: {
      targetSizesBytes: TARGET_SIZES_BYTES,
      iterations: BENCHMARK_ITERATIONS,
      payloadLengthBytes: PAYLOAD_LENGTH_BYTES,
      payloadSeedHex: `0x${PAYLOAD_SEED.toString(16)}`,
      paddingSeedHex: `0x${PADDING_SEED.toString(16)}`,
      fixedPacketDateIso: FIXED_PACKET_DATE.toISOString(),
      publicKeyPath: PUBLIC_KEY_PATH.slice(REPOSITORY_ROOT.length + 1),
      publicKeyFingerprint: publicKey.getFingerprint().toUpperCase(),
      encryptionSubkeyFingerprint: encryptionKey.getFingerprint().toUpperCase(),
      encryptionConfig: {
        aeadProtect: false,
        compression: "uncompressed",
        symmetricAlgorithm: "AES-256",
      },
    },
    commands: {
      installExactOpenPgp: "npm install --no-save --package-lock=false openpgp@6.1.1",
      run: "/usr/bin/time -f 'wall_seconds=%e peak_rss_kib=%M' node scripts/rsa-padding-benchmark.mjs",
      gpgPacketsTemplate: "gpg --batch --list-packets benchmarks/rsa-padding/artifacts/<variant>-<bytes>.pgp",
      gpgDecryptTemplate: "gpg --batch --yes --output <output> --decrypt benchmarks/rsa-padding/artifacts/<variant>-<bytes>.pgp",
      unzipTestTemplate: "unzip -t <gpg-decrypted-zip>",
    },
    payloadSha256: sha256Hex(payloadBytes),
    benchmarkWallMs: performance.now() - benchmarkStart,
    nodePeakRssKiB: process.resourceUsage().maxRSS,
    cases: benchmarkCases,
  };
  writeFileSync(RESULT_PATH, `${JSON.stringify(benchmarkResults, null, 2)}\n`);
  writeFileSync(REPORT_PATH, createMarkdownReport(benchmarkResults));
  rmSync(TEMP_DIRECTORY, { recursive: true, force: true });
  process.stdout.write(`wrote ${RESULT_PATH}\nwrote ${REPORT_PATH}\n`);
}

await main();
