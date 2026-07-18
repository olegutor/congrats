/**
 * Copy Vite docs/ build to repo root so GitHub Pages from `/` serves the bundle
 * (not raw ./src modules with bare npm specifiers).
 *
 * side-effects: writes docs/index.html, root index.html, root assets/
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
