/**
 * GPG-signed PWA release verification (no operator key passphrase required).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as openpgp from "openpgp";
import {
  RELEASE_SIGNING_KEY_FINGERPRINT,
  parseReleaseManifest,
  verifyDetachedSignature,
  verifySignedReleaseJson,
} from "../src/pwa/release-verify.js";

const g_armoredPublicKey = readFileSync(
  new URL("../olegutor-sign.pub", import.meta.url),
  "utf8",
);

describe("release-verify", () => {
  it("pins olegutor-sign fingerprint from the checked-in public key", async () => {
    expect(RELEASE_SIGNING_KEY_FINGERPRINT).toBe(
      "A21AB264F4280FE23F5BD510DA59BFD9DCDAD288",
    );
    const publicKey = await openpgp.readKey({ armoredKey: g_armoredPublicKey });
    expect(publicKey.getFingerprint().toUpperCase()).toBe(
      RELEASE_SIGNING_KEY_FINGERPRINT,
    );
  });

  it("rejects wrong fingerprint in manifest body", () => {
    expect(() =>
      parseReleaseManifest({
        name: "congrats-steg",
        version: "1",
        basePath: "/congrats/",
        createdAt: "2026-01-01T00:00:00.000Z",
        signingKeyFingerprint: "00".repeat(20),
        files: [{ path: "index.html", sha256: "ab".repeat(32) }],
      }),
    ).toThrow(/fingerprint/i);
  });

  it("verifies detached signatures and rejects tampering", async () => {
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: "rsa",
      rsaBits: 2048,
      userIDs: [{ name: "release-test" }],
      passphrase: "",
    });
    const signingKey = await openpgp.readPrivateKey({ armoredKey: privateKey });
    const payloadText = '{\n  "ok": true\n}\n';
    const message = await openpgp.createMessage({ text: payloadText });
    const armoredSignature = await openpgp.sign({
      message,
      signingKeys: signingKey,
      detached: true,
      format: "armored",
    });
    const fingerprint = await verifyDetachedSignature(
      payloadText,
      armoredSignature,
      publicKey,
    );
    expect(fingerprint).toMatch(/^[0-9A-F]{40}$/);

    await expect(
      verifyDetachedSignature(
        payloadText.replace("true", "false"),
        armoredSignature,
        publicKey,
      ),
    ).rejects.toThrow();
  });

  it("rejects signatures that are not from olegutor-sign", async () => {
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: "rsa",
      rsaBits: 2048,
      userIDs: [{ name: "wrong-signer" }],
      passphrase: "",
    });
    const signingKey = await openpgp.readPrivateKey({ armoredKey: privateKey });
    const releaseManifest = {
      name: "congrats-steg",
      version: "0.0.0-test",
      basePath: "/congrats/",
      createdAt: "2026-07-21T00:00:00.000Z",
      signingKeyFingerprint: RELEASE_SIGNING_KEY_FINGERPRINT,
      files: [{ path: "index.html", sha256: "11".repeat(32) }],
    };
    const releaseJsonText = `${JSON.stringify(releaseManifest, null, 2)}\n`;
    const message = await openpgp.createMessage({ text: releaseJsonText });
    const armoredSignature = await openpgp.sign({
      message,
      signingKeys: signingKey,
      detached: true,
      format: "armored",
    });
    await expect(
      verifySignedReleaseJson(releaseJsonText, armoredSignature, publicKey),
    ).rejects.toThrow(/expected key/i);
  });
});
