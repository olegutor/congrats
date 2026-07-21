/**
 * Print (or run, if CONGRATS_SIGN_RELEASE=1) the GPG detach-sign step for release.json.
 * Default: instructions only — passphrase entry stays with the operator.
 * side-effects: may write docs/release.json.asc when CONGRATS_SIGN_RELEASE=1
 */

import { copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const g_fingerprint = "A21AB264F4280FE23F5BD510DA59BFD9DCDAD288";
const g_releaseJsonPath = join("docs", "release.json");
const g_signaturePath = join("docs", "release.json.asc");

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(existsSync(g_releaseJsonPath), `missing ${g_releaseJsonPath}; run npm run build first`);

const gpgCommand = [
  "gpg",
  "--local-user",
  g_fingerprint,
  "--detach-sign",
  "--armor",
  "--output",
  g_signaturePath,
  g_releaseJsonPath,
].join(" ");

if (process.env.CONGRATS_SIGN_RELEASE !== "1") {
  console.log(`Sign this file (exact bytes, do not reformat):

  ${g_releaseJsonPath}

Command:

  ${gpgCommand}

Then copy the signature to the repo root (Pages sync):

  cp ${g_signaturePath} release.json.asc

Or: CONGRATS_SIGN_RELEASE=1 npm run sign-release
`);
  process.exit(0);
}

execFileSync(
  "gpg",
  [
    "--local-user",
    g_fingerprint,
    "--detach-sign",
    "--armor",
    "--output",
    g_signaturePath,
    g_releaseJsonPath,
  ],
  { stdio: "inherit" },
);

assert(existsSync(g_signaturePath), `gpg did not write ${g_signaturePath}`);
copyFileSync(g_signaturePath, "release.json.asc");
console.log(`Signed ${g_releaseJsonPath} -> ${g_signaturePath}`);
