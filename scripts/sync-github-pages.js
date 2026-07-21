/**
 * Copy Vite docs/ build to repo root so GitHub Pages from `/` serves the bundle
 * (not raw ./src modules with bare npm specifiers).
 *
 * side-effects: writes docs/index.html, root index.html, root assets/, PWA files
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const docsDir = "docs";
const builtAppHtmlPath = join(docsDir, "app.html");
assert(existsSync(builtAppHtmlPath), `expected ${builtAppHtmlPath} after vite build`);

const builtHtml = readFileSync(builtAppHtmlPath, "utf8");
writeFileSync(join(docsDir, "index.html"), builtHtml);
writeFileSync("index.html", builtHtml);
writeFileSync(join(docsDir, ".nojekyll"), "");

rmSync("assets", { recursive: true, force: true });
mkdirSync("assets", { recursive: true });
cpSync(join(docsDir, "assets"), "assets", { recursive: true });

if (existsSync(join(docsDir, "icons"))) {
  rmSync("icons", { recursive: true, force: true });
  cpSync(join(docsDir, "icons"), "icons", { recursive: true });
}

const rootCopyFiles = [
  "sw.js",
  "manifest.webmanifest",
  "olegutor-sign.pub",
  "release.json",
  "release.json.asc",
];
for (const fileName of rootCopyFiles) {
  const docsPath = join(docsDir, fileName);
  if (existsSync(docsPath)) {
    cpSync(docsPath, fileName);
  }
}

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

console.log("Synced GitHub Pages artifacts to docs/ and repo root.");
