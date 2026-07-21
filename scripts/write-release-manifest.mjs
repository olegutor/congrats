/**
 * Build docs/release.json with SHA-256 hashes of deployed PWA files.
 * side-effects: writes docs/release.json and root release.json
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const g_docsDirectory = "docs";
const g_basePath = process.env.BASE_PATH ?? "/congrats/";
const g_signingFingerprint = "A21AB264F4280FE23F5BD510DA59BFD9DCDAD288";
const g_excludedNames = new Set([
  "release.json",
  "release.json.asc",
  ".nojekyll",
  ".DS_Store",
]);

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

/**
 * @param {string} directoryPath
 * @returns {string[]}
 */
function listFilesRecursive(directoryPath) {
  /** @type {string[]} */
  const filePaths = [];
  for (const entryName of readdirSync(directoryPath)) {
    if (entryName === "." || entryName === "..") {
      continue;
    }
    const absolutePath = join(directoryPath, entryName);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      filePaths.push(...listFilesRecursive(absolutePath));
      continue;
    }
    if (stats.isFile()) {
      filePaths.push(absolutePath);
    }
  }
  return filePaths;
}

/**
 * @param {Buffer} fileBytes
 * @returns {string}
 */
function sha256HexNode(fileBytes) {
  return createHash("sha256").update(fileBytes).digest("hex");
}

/**
 * @returns {string}
 */
function readGitDescribe() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "nogit";
  }
}

assert(existsSync(g_docsDirectory), `missing ${g_docsDirectory}/ after vite build`);
assert(g_basePath.startsWith("/") && g_basePath.endsWith("/"), `bad BASE_PATH ${g_basePath}`);

const allFiles = listFilesRecursive(g_docsDirectory)
  .map((absolutePath) => ({
    absolutePath,
    path: relative(g_docsDirectory, absolutePath).split(sep).join("/"),
  }))
  .filter((entry) => !g_excludedNames.has(entry.path.split("/").pop() ?? ""))
  .sort((left, right) => left.path.localeCompare(right.path));

assert(allFiles.some((entry) => entry.path === "sw.js"), "docs/sw.js missing");
assert(allFiles.some((entry) => entry.path === "index.html"), "docs/index.html missing");
assert(
  allFiles.some((entry) => entry.path === "olegutor-sign.pub"),
  "docs/olegutor-sign.pub missing",
);

const files = allFiles.map((entry) => {
  const fileBytes = readFileSync(entry.absolutePath);
  return { path: entry.path, sha256: sha256HexNode(fileBytes) };
});

const version = `${packageJson.version}+${readGitDescribe()}.${Date.now()}`;
const releaseManifest = {
  name: "congrats-steg",
  version,
  basePath: g_basePath,
  createdAt: new Date().toISOString(),
  signingKeyFingerprint: g_signingFingerprint,
  files,
};

const releaseJsonText = `${JSON.stringify(releaseManifest, null, 2)}\n`;
writeFileSync(join(g_docsDirectory, "release.json"), releaseJsonText, "utf8");
writeFileSync("release.json", releaseJsonText, "utf8");
console.log(
  `Wrote release.json version=${version} files=${files.length} basePath=${g_basePath}`,
);
