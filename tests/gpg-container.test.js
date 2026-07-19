/** Vitest coverage for fixed-size markerless RSA-3072 OpenPGP containers. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as openpgp from "openpgp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GPG_CONTAINER_PROFILES,
  encryptGpgContainer,
  getGpgContainerProfile,
  rebuildGpgContainerMessage,
  recoverGpgContainerRsaCiphertext,
  selectGpgContainerProfile,
} from "../src/crypto/gpg-container.js";

const TEST_PAYLOAD = new TextEncoder().encode("fixed container test payload");
/** @type {string} */
let g_publicKeyArmored;

beforeAll(() => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  g_publicKeyArmored = readFileSync(join(testDirectory, "../test_rsa3072.pub"), "utf8");
});

/**
 * Return the canonical unsigned MPI body without redundant zero octets.
 *
 * @param {Uint8Array} integerBytes shape (integerLength,)
 * @returns {Uint8Array} shape (canonicalIntegerLength,)
 */
function trimLeadingZeroBytes(integerBytes) {
  const firstNonzeroIndex = integerBytes.findIndex((integerByte) => integerByte !== 0);
  return firstNonzeroIndex < 0
    ? integerBytes.slice(-1)
    : integerBytes.slice(firstNonzeroIndex);
}

describe("GPG container profiles", () => {
  it("defines exact embedded lengths and usable capacities", () => {
    expect(GPG_CONTAINER_PROFILES.map((profile) => profile.embeddedLength)).toEqual([
      1024,
      2048,
      4096,
      8192,
      16384,
      32768,
    ]);
    for (const profile of GPG_CONTAINER_PROFILES) {
      expect(profile.encryptedSeipdLength).toBe(profile.embeddedLength - 400);
      expect(profile.maxPayloadLength).toBeGreaterThan(0);
      expect(getGpgContainerProfile(profile.embeddedLength)).toBe(profile);
    }
    expect(selectGpgContainerProfile(TEST_PAYLOAD.length).embeddedLength).toBe(1024);
  });

  it.each(GPG_CONTAINER_PROFILES)(
    "encodes the advertised $maxPayloadLength-byte capacity at $embeddedLength bytes",
    async (profile) => {
      const maximumPayload = new Uint8Array(profile.maxPayloadLength);
      const { embeddedBytes } = await encryptGpgContainer(
        maximumPayload,
        g_publicKeyArmored,
        profile.embeddedLength,
      );
      expect(embeddedBytes).toHaveLength(profile.embeddedLength);
    },
    30_000,
  );
});

describe("markerless GPG container", () => {
  it.each(GPG_CONTAINER_PROFILES)(
    "produces exact $embeddedLength-byte containers and parseable standard PGP",
    async (profile) => {
      const { embeddedBytes, profile: returnedProfile } = await encryptGpgContainer(
        TEST_PAYLOAD,
        g_publicKeyArmored,
        profile.embeddedLength,
      );
      expect(returnedProfile).toBe(profile);
      expect(embeddedBytes).toHaveLength(profile.embeddedLength);

      const rsaCiphertext = await recoverGpgContainerRsaCiphertext(
        embeddedBytes,
        g_publicKeyArmored,
        profile.embeddedLength,
      );
      expect(rsaCiphertext).toHaveLength(384);

      const standardMessageBytes = await rebuildGpgContainerMessage(
        embeddedBytes,
        g_publicKeyArmored,
        profile.embeddedLength,
      );
      const parsedMessage = await openpgp.readMessage({ binaryMessage: standardMessageBytes });
      expect(parsedMessage.packets).toHaveLength(2);
      expect(parsedMessage.packets[0]).toBeInstanceOf(
        openpgp.PublicKeyEncryptedSessionKeyPacket,
      );
      expect(parsedMessage.packets[0].version).toBe(3);
      expect(parsedMessage.packets[0].encrypted.c).toEqual(
        trimLeadingZeroBytes(rsaCiphertext),
      );
      expect(parsedMessage.packets[1]).toBeInstanceOf(
        openpgp.SymEncryptedIntegrityProtectedDataPacket,
      );
      expect(parsedMessage.packets[1].version).toBe(1);
      expect(standardMessageBytes.slice(-profile.encryptedSeipdLength)).toEqual(
        embeddedBytes.slice(400),
      );
    },
    30_000,
  );

  it("randomizes both encryptions while preserving the residue round-trip", async () => {
    const profile = getGpgContainerProfile(1024);
    const firstEncryption = await encryptGpgContainer(
      TEST_PAYLOAD,
      g_publicKeyArmored,
      profile.embeddedLength,
    );
    const secondEncryption = await encryptGpgContainer(
      TEST_PAYLOAD,
      g_publicKeyArmored,
      profile.embeddedLength,
    );
    expect(firstEncryption.embeddedBytes).not.toEqual(secondEncryption.embeddedBytes);

    const firstResidue = await recoverGpgContainerRsaCiphertext(
      firstEncryption.embeddedBytes,
      g_publicKeyArmored,
      profile.embeddedLength,
    );
    const firstStandardMessage = await rebuildGpgContainerMessage(
      firstEncryption.embeddedBytes,
      g_publicKeyArmored,
      profile.embeddedLength,
    );
    const parsedMessage = await openpgp.readMessage({ binaryMessage: firstStandardMessage });
    expect(parsedMessage.packets[0].encrypted.c).toEqual(
      trimLeadingZeroBytes(firstResidue),
    );
  });

  it("fails fast for a mismatched externally supplied profile", async () => {
    const { embeddedBytes } = await encryptGpgContainer(
      TEST_PAYLOAD,
      g_publicKeyArmored,
      1024,
    );
    await expect(rebuildGpgContainerMessage(
      embeddedBytes,
      g_publicKeyArmored,
      2048,
    )).rejects.toThrow("expected embedded length 2048, got 1024");
  });
});
