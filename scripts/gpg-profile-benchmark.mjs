#!/usr/bin/env node

/** Reproducible end-to-end benchmark for fixed markerless GPG PNG profiles. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import process from "node:process";
import * as openpgp from "openpgp";
import {
  decodeImageDataToBinaryGpgMessage,
  encodeBytesIntoImageData,
  estimateMaxMessageBits,
  selectGpgProfileForImage,
} from "../src/payload/codec.js";
import { GPG_CONTAINER_PROFILES } from "../src/crypto/gpg-container.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const PUBLIC_KEY_PATH = join(REPOSITORY_ROOT, "test_rsa3072.pub");
const PACKAGE_LOCK_PATH = join(REPOSITORY_ROOT, "package-lock.json");
const BENCHMARK_DIRECTORY = join(REPOSITORY_ROOT, "benchmarks", "gpg-profiles");
const RESULT_PATH = join(BENCHMARK_DIRECTORY, "results.json");
const REPORT_PATH = join(BENCHMARK_DIRECTORY, "report.md");
const MEASURED_REPETITIONS = 2;
const PAYLOAD_SEED = 0x47504731;
const TIME_MARKER = "__GPG_PROFILE_TIME__";
const CARDS = Object.freeze([
  Object.freeze({
    id: "compact",
    width: 384,
    height: 480,
    imageSeed: 0xc04fac71,
    expectedEmbeddedLength: 4096,
  }),
  Object.freeze({
    id: "medium",
    width: 540,
    height: 675,
    imageSeed: 0x0ed1a175,
    expectedEmbeddedLength: 8192,
  }),
  Object.freeze({
    id: "full",
    width: 1080,
    height: 1350,
    imageSeed: 0xf011ca7d,
    expectedEmbeddedLength: 32768,
  }),
]);

/**
 * @typedef {Readonly<{
 *   id: string,
 *   width: number,
 *   height: number,
 *   imageSeed: number,
 *   expectedEmbeddedLength: number
 * }>} CardDefinition
 */

/**
 * Return a SHA-256 hexadecimal digest.
 *
 * @param {Uint8Array | Uint8ClampedArray | string} inputData shape (byteLength,) for byte input
 * @returns {string} shape ()
 */
function sha256Hex(inputData) {
  assert(
    inputData instanceof Uint8Array
      || inputData instanceof Uint8ClampedArray
      || typeof inputData === "string",
    `expected byte array or string inputData, got ${Object.prototype.toString.call(inputData)}`,
  );
  return createHash("sha256").update(inputData).digest("hex");
}

/**
 * Create deterministic pseudo-random bytes with xorshift32.
 *
 * @param {number} byteLength shape ()
 * @param {number} seed shape ()
 * @returns {Uint8Array} shape (byteLength,)
 */
function createDeterministicBytes(byteLength, seed) {
  assert(
    Number.isSafeInteger(byteLength) && byteLength >= 0,
    `expected non-negative safe byteLength, got ${byteLength}`,
  );
  assert(
    Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff,
    `expected uint32 seed, got ${seed}`,
  );
  const generatedBytes = new Uint8Array(byteLength);
  let generatorState = seed >>> 0;
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    // Loop invariant: bytes before byteIndex are fixed by seed and xorshift32.
    generatorState ^= generatorState << 13;
    generatorState ^= generatorState >>> 17;
    generatorState ^= generatorState << 5;
    generatedBytes[byteIndex] = generatorState & 0xff;
  }
  return generatedBytes;
}

/**
 * Create deterministic textured ImageData-like RGBA pixels.
 *
 * @param {number} width shape ()
 * @param {number} height shape ()
 * @param {number} seed shape ()
 * @returns {{width: number, height: number, data: Uint8ClampedArray}} data shape (width * height * 4,)
 */
function createTexturedImageData(width, height, seed) {
  assert(Number.isSafeInteger(width) && width > 0, `expected positive integer width, got ${width}`);
  assert(Number.isSafeInteger(height) && height > 0, `expected positive integer height, got ${height}`);
  const textureNoise = createDeterministicBytes(width * height * 3, seed);
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    // Loop invariant: every preceding pixel has deterministic opaque textured RGBA.
    const horizontalCoordinate = pixelIndex % width;
    const verticalCoordinate = Math.floor(pixelIndex / width);
    const rgbaOffset = pixelIndex * 4;
    const noiseOffset = pixelIndex * 3;
    const checkerValue = ((horizontalCoordinate >> 4) ^ (verticalCoordinate >> 4)) & 1;
    rgbaData[rgbaOffset] = (
      37 + horizontalCoordinate * 3 + verticalCoordinate + textureNoise[noiseOffset] / 3
    ) & 0xff;
    rgbaData[rgbaOffset + 1] = (
      83 + horizontalCoordinate + verticalCoordinate * 2 + textureNoise[noiseOffset + 1] / 2
    ) & 0xff;
    rgbaData[rgbaOffset + 2] = (
      131 + horizontalCoordinate * 2 + verticalCoordinate * 3
      + checkerValue * 29 + textureNoise[noiseOffset + 2] / 3
    ) & 0xff;
    rgbaData[rgbaOffset + 3] = 255;
  }
  return { width, height, data: rgbaData };
}

/**
 * Clone ImageData-like pixels for one independent repetition.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData data shape (width * height * 4,)
 * @returns {{width: number, height: number, data: Uint8ClampedArray}} data shape (width * height * 4,)
 */
function cloneImageData(imageData) {
  assert(
    imageData.data.length === imageData.width * imageData.height * 4,
    `expected RGBA length ${imageData.width * imageData.height * 4}, got ${imageData.data.length}`,
  );
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

/**
 * Calculate timing distribution statistics.
 *
 * @param {number[]} timingSamplesMs shape (sampleCount,)
 * @returns {{minimumMs: number, medianMs: number, meanMs: number, maximumMs: number, samplesMs: number[]}} shape ()
 */
function summarizeTimings(timingSamplesMs) {
  assert(
    Array.isArray(timingSamplesMs) && timingSamplesMs.length > 0,
    `expected non-empty timingSamplesMs, got ${timingSamplesMs.length}`,
  );
  const sortedSamples = [...timingSamplesMs].sort(
    (leftTiming, rightTiming) => leftTiming - rightTiming,
  );
  const middleIndex = Math.floor(sortedSamples.length / 2);
  const medianMs = sortedSamples.length % 2 === 0
    ? (sortedSamples[middleIndex - 1] + sortedSamples[middleIndex]) / 2
    : sortedSamples[middleIndex];
  return {
    minimumMs: sortedSamples[0],
    medianMs,
    meanMs: sortedSamples.reduce((timingSum, timingValue) => timingSum + timingValue, 0)
      / sortedSamples.length,
    maximumMs: sortedSamples.at(-1),
    samplesMs: timingSamplesMs,
  };
}

/**
 * Run a command and return trimmed stdout, or an explicit unavailable marker.
 *
 * side-effects: starts a subprocess.
 *
 * @param {string} command shape ()
 * @param {string[]} argumentList shape (argumentCount,)
 * @returns {string} shape ()
 */
function readOptionalCommand(command, argumentList) {
  const commandResult = spawnSync(command, argumentList, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return commandResult.status === 0
    ? commandResult.stdout.trim()
    : `unavailable (exit ${commandResult.status ?? "spawn-error"})`;
}

/**
 * Return one card definition by ID.
 *
 * @param {string} cardId shape ()
 * @returns {CardDefinition} shape ()
 */
function getCardDefinition(cardId) {
  const cardDefinition = CARDS.find((candidateCard) => candidateCard.id === cardId);
  assert(cardDefinition !== undefined, `expected cardId in ${CARDS.map((card) => card.id)}, got ${cardId}`);
  return cardDefinition;
}

/**
 * Return several representative payload lengths including the exact maximum.
 *
 * @param {number} maximumPayloadLength shape ()
 * @returns {number[]} shape (3,)
 */
function selectPayloadLengths(maximumPayloadLength) {
  assert(
    Number.isSafeInteger(maximumPayloadLength) && maximumPayloadLength >= 512,
    `expected maximumPayloadLength >= 512, got ${maximumPayloadLength}`,
  );
  const payloadLengths = [256, Math.floor(maximumPayloadLength / 2), maximumPayloadLength];
  assert.equal(
    new Set(payloadLengths).size,
    payloadLengths.length,
    `expected distinct payload lengths, got ${payloadLengths.join(",")}`,
  );
  return payloadLengths;
}

/**
 * Benchmark one card/payload case inside an isolated process.
 *
 * side-effects: consumes cryptographic randomness and mutates cloned image pixels.
 *
 * @param {CardDefinition} cardDefinition shape ()
 * @param {number} payloadLength shape ()
 * @param {number} repetitionCount shape ()
 * @param {string} publicKeyArmored shape ()
 * @returns {Promise<Record<string, unknown>>} shape ()
 */
async function benchmarkWorkerCase(
  cardDefinition,
  payloadLength,
  repetitionCount,
  publicKeyArmored,
) {
  assert(
    Number.isSafeInteger(repetitionCount) && repetitionCount >= 1,
    `expected positive repetitionCount, got ${repetitionCount}`,
  );
  const selectedProfile = selectGpgProfileForImage(cardDefinition.width, cardDefinition.height);
  assert.equal(
    selectedProfile.embeddedLength,
    cardDefinition.expectedEmbeddedLength,
    `expected ${cardDefinition.id} profile ${cardDefinition.expectedEmbeddedLength}, got ${selectedProfile.embeddedLength}`,
  );
  assert(
    payloadLength <= selectedProfile.maxPayloadLength,
    `expected payload <= ${selectedProfile.maxPayloadLength}, got ${payloadLength}`,
  );
  const sourceImageData = createTexturedImageData(
    cardDefinition.width,
    cardDefinition.height,
    cardDefinition.imageSeed,
  );
  const payloadBytes = createDeterministicBytes(
    payloadLength,
    (PAYLOAD_SEED ^ cardDefinition.imageSeed ^ payloadLength) >>> 0,
  );
  /** @type {number[]} */
  const encryptionEmbeddingTimingsMs = [];
  /** @type {number[]} */
  const extractionRebuildTimingsMs = [];
  /** @type {Record<string, unknown>[]} */
  const repetitionSamples = [];
  for (let repetitionIndex = 0; repetitionIndex < repetitionCount; repetitionIndex += 1) {
    // Loop invariant: each prior sample passed byte extraction and OpenPGP parsing checks.
    const stegoImageData = cloneImageData(sourceImageData);
    const encodeStart = performance.now();
    const encodeResult = await encodeBytesIntoImageData(stegoImageData, payloadBytes, {
      publicKeyArmored,
    });
    const encodeElapsedMs = performance.now() - encodeStart;
    const decodeStart = performance.now();
    const decodeResult = await decodeImageDataToBinaryGpgMessage(stegoImageData, publicKeyArmored);
    const decodeElapsedMs = performance.now() - decodeStart;
    const parsedMessage = await openpgp.readMessage({
      binaryMessage: decodeResult.binaryPgpMessage,
    });
    const packetClasses = Array.from(
      parsedMessage.packets,
      (packet) => packet.constructor.name,
    );
    assert.deepEqual(
      packetClasses,
      ["PublicKeyEncryptedSessionKeyPacket", "SymEncryptedIntegrityProtectedDataPacket"],
      `expected standard PKESK+SEIPD packets, got ${packetClasses.join(",")}`,
    );
    assert.equal(
      encodeResult.embeddedByteCount,
      selectedProfile.embeddedLength,
      `expected embeddedByteCount ${selectedProfile.embeddedLength}, got ${encodeResult.embeddedByteCount}`,
    );
    assert.equal(
      decodeResult.embeddedBytes.length,
      selectedProfile.embeddedLength,
      `expected extracted length ${selectedProfile.embeddedLength}, got ${decodeResult.embeddedBytes.length}`,
    );
    encryptionEmbeddingTimingsMs.push(encodeElapsedMs);
    extractionRebuildTimingsMs.push(decodeElapsedMs);
    repetitionSamples.push({
      repetitionIndex,
      encryptionEmbeddingMs: encodeElapsedMs,
      extractionRebuildMs: decodeElapsedMs,
      stegoStats: encodeResult.stegoStats,
      embeddedSha256: sha256Hex(decodeResult.embeddedBytes),
      stegoRgbaSha256: sha256Hex(stegoImageData.data),
      outputPgpLength: decodeResult.binaryPgpMessage.length,
      outputPgpSha256: sha256Hex(decodeResult.binaryPgpMessage),
      parsedPacketClasses: packetClasses,
    });
  }
  const firstStegoStats = /** @type {Record<string, number>} */ (
    repetitionSamples[0].stegoStats
  );
  return {
    cardId: cardDefinition.id,
    dimensions: { width: cardDefinition.width, height: cardDefinition.height },
    imageSeedHex: `0x${cardDefinition.imageSeed.toString(16).padStart(8, "0")}`,
    sourceRgbaSha256: sha256Hex(sourceImageData.data),
    payloadLength,
    payloadSha256: sha256Hex(payloadBytes),
    profile: selectedProfile,
    embeddedLength: selectedProfile.embeddedLength,
    effectiveMaxPayload: selectedProfile.maxPayloadLength,
    coverBitCount: firstStegoStats.coverBitCount,
    changedCountSamples: repetitionSamples.map(
      (sample) => /** @type {Record<string, number>} */ (sample.stegoStats).changedCount,
    ),
    totalDistortionSamples: repetitionSamples.map(
      (sample) => /** @type {Record<string, number>} */ (sample.stegoStats).totalDistortion,
    ),
    embeddingRateSamples: repetitionSamples.map(
      (sample) => /** @type {Record<string, number>} */ (sample.stegoStats).embeddingRate,
    ),
    encryptionEmbeddingTiming: summarizeTimings(encryptionEmbeddingTimingsMs),
    extractionRebuildTiming: summarizeTimings(extractionRebuildTimingsMs),
    repetitions: repetitionSamples,
    processPeakRssKiB: process.resourceUsage().maxRSS,
  };
}

/**
 * Run one worker under GNU time and parse its JSON plus peak RSS.
 *
 * side-effects: starts an isolated benchmark subprocess.
 *
 * @param {CardDefinition} cardDefinition shape ()
 * @param {number} payloadLength shape ()
 * @returns {Record<string, unknown>} shape ()
 */
function runIsolatedCase(cardDefinition, payloadLength) {
  const commandResult = spawnSync("/usr/bin/time", [
    "-f",
    `${TIME_MARKER} wall_seconds=%e peak_rss_kib=%M`,
    process.execPath,
    SCRIPT_PATH,
    "--worker",
    cardDefinition.id,
    String(payloadLength),
    String(MEASURED_REPETITIONS),
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(
    commandResult.status,
    0,
    `expected worker status 0 for ${cardDefinition.id}/${payloadLength}, got ${commandResult.status}: ${commandResult.stderr}`,
  );
  const timeMatch = commandResult.stderr.match(
    new RegExp(`${TIME_MARKER} wall_seconds=([0-9.]+) peak_rss_kib=(\\d+)`),
  );
  assert(timeMatch !== null, `expected GNU time marker, got stderr ${commandResult.stderr}`);
  const workerResult = JSON.parse(commandResult.stdout);
  return {
    ...workerResult,
    isolatedProcessWallMs: Number.parseFloat(timeMatch[1]) * 1000,
    isolatedProcessPeakRssKiB: Number.parseInt(timeMatch[2], 10),
  };
}

/**
 * Collect exact benchmark environment and dependency metadata.
 *
 * side-effects: starts version-reporting subprocesses.
 *
 * @returns {Record<string, unknown>} shape ()
 */
function collectEnvironment() {
  const packageLockText = readFileSync(PACKAGE_LOCK_PATH, "utf8");
  const packageLock = JSON.parse(packageLockText);
  const installedOpenPgpPackage = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, "node_modules", "openpgp", "package.json"), "utf8"),
  );
  const lockedOpenPgpVersion = packageLock.packages["node_modules/openpgp"].version;
  assert.equal(
    installedOpenPgpPackage.version,
    lockedOpenPgpVersion,
    `expected installed OpenPGP.js ${lockedOpenPgpVersion}, got ${installedOpenPgpPackage.version}`,
  );
  return {
    capturedAtUtc: new Date().toISOString(),
    uname: readOptionalCommand("uname", ["-a"]),
    osRelease: readFileSync("/etc/os-release", "utf8").trim(),
    node: process.version,
    npm: readOptionalCommand("npm", ["--version"]),
    packageLockVersion: packageLock.lockfileVersion,
    packageLockSha256: sha256Hex(packageLockText),
    openpgpPackageRange: packageLock.packages[""].dependencies.openpgp,
    openpgpLockedVersion: lockedOpenPgpVersion,
    openpgpInstalledVersion: installedOpenPgpPackage.version,
    gnupg: readOptionalCommand("gpg", ["--version"]),
    chromium: readOptionalCommand("chromium", ["--version"]),
    cpuModel: cpus()[0]?.model ?? "unavailable",
    cpuLogicalCount: cpus().length,
    ramTotalBytes: totalmem(),
    ramFreeAtStartBytes: freemem(),
    nvidiaDriver: readOptionalCommand(
      "nvidia-smi",
      ["--query-gpu=driver_version", "--format=csv,noheader"],
    ),
    gpuAndVramMiB: readOptionalCommand(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    ),
    gpuVramPeak: "not used (CPU-only Node.js benchmark)",
    gitCommit: readOptionalCommand("git", ["rev-parse", "HEAD"]),
  };
}

/**
 * Format the benchmark as a concise Markdown report.
 *
 * @param {Record<string, any>} benchmarkResults shape ()
 * @returns {string} shape ()
 */
function createMarkdownReport(benchmarkResults) {
  const resultRows = benchmarkResults.cases.map((benchmarkCase) => {
    const changedRange = `${Math.min(...benchmarkCase.changedCountSamples)}–${Math.max(...benchmarkCase.changedCountSamples)}`;
    const distortionRange = `${Math.min(...benchmarkCase.totalDistortionSamples).toFixed(2)}–${Math.max(...benchmarkCase.totalDistortionSamples).toFixed(2)}`;
    return `| ${benchmarkCase.cardId} | ${benchmarkCase.payloadLength} | ${benchmarkCase.embeddedLength} | `
      + `${benchmarkCase.coverBitCount} | ${changedRange} | ${distortionRange} | `
      + `${benchmarkCase.embeddingRateSamples[0].toFixed(6)} | `
      + `${benchmarkCase.encryptionEmbeddingTiming.medianMs.toFixed(2)} | `
      + `${benchmarkCase.extractionRebuildTiming.medianMs.toFixed(2)} | `
      + `${benchmarkCase.repetitions[0].outputPgpLength} | ${benchmarkCase.isolatedProcessPeakRssKiB} |`;
  });
  const profileRows = benchmarkResults.cards.map((card) => (
    `| ${card.id} | ${card.width}×${card.height} | ${card.capacityBytes} | `
    + `${card.selectedProfile.embeddedLength} | ${card.selectedProfile.maxPayloadLength} | `
    + `${card.capacityReserveBytes} |`
  ));
  return `# GPG fixed-profile end-to-end benchmark

## Вывод

Выбор профиля детерминирован размерами и консервативной оценкой cover capacity:
compact/medium/full всегда выбирают соответственно **4096 / 8192 / 32768 B**.
Каждая карточка прошла реальное шифрование, spatial embedding, extraction,
восстановление стандартного OpenPGP и разбор OpenPGP.js как PKESKv3 + SEIPDv1.
Проверены payload 256 B, около половины максимума и точный effective max.

Запас cover capacity после фиксированного контейнера составляет
${benchmarkResults.cards.map((card) => `${card.id} ${card.capacityReserveBytes} B`).join(", ")}.
Это запас оценки канала, а не дополнительный payload: effective max задаётся
структурой GPG-контейнера и приведён ниже.

| card | dimensions | estimated capacity B | selected profile B | effective max payload B | capacity reserve B |
|---|---:|---:|---:|---:|---:|
${profileRows.join("\n")}

## Измерения

| card | payload B | embedded B | cover bits | changed | distortion | rate | encrypt+embed median ms | extract+rebuild median ms | output PGP B | peak RSS KiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${resultRows.join("\n")}

Каждая строка содержит ${benchmarkResults.parameters.measuredRepetitions} независимых
измерения; OpenPGP-шифротекст недетерминирован из-за обязательной криптографической
случайности. Поэтому raw JSON хранит hashes и stego-метрики каждого повтора,
а source/payload hashes воспроизводимы по фиксированным seeds.

## Воспроизведение

\`\`\`bash
cd ${REPOSITORY_ROOT}
/usr/bin/time -f 'wall_seconds=%e peak_rss_kib=%M' \\
  node scripts/gpg-profile-benchmark.mjs
\`\`\`

Пакеты не устанавливаются. Используются существующие \`node_modules\`,
\`package-lock.json\` и \`test_rsa3072.pub\`. Полное окружение, samples, hashes,
параметры и результаты находятся в \`benchmarks/gpg-profiles/results.json\`.
GPU не используется; значение vRAM peak помечено как not used.
`;
}

/**
 * Run all isolated cases and write raw JSON plus Markdown.
 *
 * side-effects: starts workers and writes benchmark result files.
 *
 * @returns {void} shape ()
 */
function runCoordinator() {
  assert.equal(
    process.cwd(),
    REPOSITORY_ROOT,
    `expected current directory ${REPOSITORY_ROOT}, got ${process.cwd()}`,
  );
  const coordinatorStart = performance.now();
  mkdirSync(BENCHMARK_DIRECTORY, { recursive: true });
  const publicKeyArmored = readFileSync(PUBLIC_KEY_PATH, "utf8");
  assert(publicKeyArmored.includes("BEGIN PGP PUBLIC KEY BLOCK"), "expected armored public key");
  const environment = collectEnvironment();
  const cardSummaries = CARDS.map((cardDefinition) => {
    const firstSelection = selectGpgProfileForImage(cardDefinition.width, cardDefinition.height);
    const secondSelection = selectGpgProfileForImage(cardDefinition.width, cardDefinition.height);
    assert.deepEqual(firstSelection, secondSelection, `expected deterministic profile for ${cardDefinition.id}`);
    assert.equal(
      firstSelection.embeddedLength,
      cardDefinition.expectedEmbeddedLength,
      `expected ${cardDefinition.expectedEmbeddedLength} profile for ${cardDefinition.id}, got ${firstSelection.embeddedLength}`,
    );
    const capacityBits = estimateMaxMessageBits(cardDefinition.width, cardDefinition.height);
    const capacityBytes = Math.floor(capacityBits / 8);
    return {
      ...cardDefinition,
      capacityBits,
      capacityBytes,
      selectedProfile: firstSelection,
      capacityReserveBytes: capacityBytes - firstSelection.embeddedLength,
    };
  });
  /** @type {Record<string, unknown>[]} */
  const benchmarkCases = [];
  for (const cardSummary of cardSummaries) {
    const payloadLengths = selectPayloadLengths(cardSummary.selectedProfile.maxPayloadLength);
    for (const payloadLength of payloadLengths) {
      // Loop invariant: every prior case completed in an isolated measured process.
      process.stderr.write(`benchmarking ${cardSummary.id} payload ${payloadLength} B\n`);
      benchmarkCases.push(runIsolatedCase(cardSummary, payloadLength));
    }
  }
  const benchmarkResults = {
    schemaVersion: 1,
    environment,
    parameters: {
      measuredRepetitions: MEASURED_REPETITIONS,
      payloadSeedHex: `0x${PAYLOAD_SEED.toString(16)}`,
      publicKeyPath: relative(REPOSITORY_ROOT, PUBLIC_KEY_PATH),
      publicKeySha256: sha256Hex(publicKeyArmored),
      scriptPath: relative(REPOSITORY_ROOT, SCRIPT_PATH),
      scriptSha256: sha256Hex(readFileSync(SCRIPT_PATH)),
      profileDefinitions: GPG_CONTAINER_PROFILES,
      command: "/usr/bin/time -f 'wall_seconds=%e peak_rss_kib=%M' node scripts/gpg-profile-benchmark.mjs",
    },
    cards: cardSummaries,
    cases: benchmarkCases,
    coordinatorWallMs: performance.now() - coordinatorStart,
    coordinatorPeakRssKiB: process.resourceUsage().maxRSS,
  };
  writeFileSync(RESULT_PATH, `${JSON.stringify(benchmarkResults, null, 2)}\n`);
  writeFileSync(REPORT_PATH, createMarkdownReport(benchmarkResults));
  process.stdout.write(`wrote ${RESULT_PATH}\nwrote ${REPORT_PATH}\n`);
}

/**
 * Dispatch coordinator or isolated worker mode.
 *
 * side-effects: runs benchmark work and may write report files.
 *
 * @returns {Promise<void>} shape ()
 */
async function main() {
  if (process.argv[2] === "--worker") {
    assert.equal(process.argv.length, 6, `expected 4 worker arguments, got ${process.argv.length - 2}`);
    const cardDefinition = getCardDefinition(process.argv[3]);
    const payloadLength = Number.parseInt(process.argv[4], 10);
    const repetitionCount = Number.parseInt(process.argv[5], 10);
    assert(Number.isSafeInteger(payloadLength) && payloadLength >= 0, `expected payloadLength, got ${process.argv[4]}`);
    assert(Number.isSafeInteger(repetitionCount) && repetitionCount >= 1, `expected repetitionCount, got ${process.argv[5]}`);
    const workerResult = await benchmarkWorkerCase(
      cardDefinition,
      payloadLength,
      repetitionCount,
      readFileSync(PUBLIC_KEY_PATH, "utf8"),
    );
    process.stdout.write(`${JSON.stringify(workerResult)}\n`);
    return;
  }
  assert.equal(process.argv.length, 2, `expected no coordinator arguments, got ${process.argv.slice(2)}`);
  runCoordinator();
}

await main();
