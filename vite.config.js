import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const g_configDirectory = dirname(fileURLToPath(import.meta.url));

/** GitHub Pages project site base (`/congrats/` on olegutor.github.io/congrats/). */
const basePath = process.env.BASE_PATH ?? "/";

const WASM_ARRAYBUFFER_SUFFIX = ".wasm?arraybuffer";

/**
 * Inline `.wasm?arraybuffer` imports as ArrayBuffer modules (offline-safe, no fetch).
 * @returns {import("vite").Plugin}
 */
function wasmArrayBufferPlugin() {
  return {
    name: "wasm-arraybuffer",
    enforce: "pre",
    /**
     * @param {string} source
     * @param {string | undefined} importer
     * @returns {string | null}
     */
    resolveId(source, importer) {
      if (!source.endsWith(WASM_ARRAYBUFFER_SUFFIX)) {
        return null;
      }
      const wasmPath = source.slice(0, -"?arraybuffer".length);
      const resolved = importer !== undefined
        ? resolve(dirname(importer), wasmPath)
        : resolve(g_configDirectory, wasmPath);
      return `${resolved}?arraybuffer`;
    },
    /**
     * @param {string} id
     * @returns {string | null}
     */
    load(id) {
      if (!id.endsWith(WASM_ARRAYBUFFER_SUFFIX)) {
        return null;
      }
      const wasmPath = id.slice(0, -"?arraybuffer".length);
      const wasmBase64 = readFileSync(wasmPath).toString("base64");
      return (
        `const g_binaryString = atob(${JSON.stringify(wasmBase64)});\n`
        + `const g_wasmBytes = new Uint8Array(g_binaryString.length);\n`
        + `for (let g_index = 0; g_index < g_binaryString.length; g_index += 1) {\n`
        + `  g_wasmBytes[g_index] = g_binaryString.charCodeAt(g_index);\n`
        + `}\n`
        + `export default g_wasmBytes.buffer;\n`
      );
    },
  };
}

const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export default defineConfig({
  base: basePath,
  root: ".",
  publicDir: "public",
  assetsInclude: ["**/*.wasm"],
  build: {
    outDir: "docs",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(g_configDirectory, "app.html"),
        sw: resolve(g_configDirectory, "src/pwa/service-worker.js"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "sw") {
            return "sw.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 5174,
  },
  plugins: [
    wasmArrayBufferPlugin(),
    {
      name: "serve-app-html-as-index",
      /**
       * side-effects: rewrites / to app.html in dev
       * @param {import('vite').ViteDevServer} server
       * @returns {void}
       */
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url === "/" || request.url === "/index.html") {
            request.url = "/app.html";
          }
          next();
        });
      },
    },
    {
      name: "inject-production-csp",
      /**
       * @param {string} html
       * @param {{ server?: unknown }} context
       * @returns {string}
       */
      transformIndexHtml(html, context) {
        if (context.server) {
          return html;
        }
        const cspMeta = (
          `<meta http-equiv="Content-Security-Policy" `
          + `content="${PRODUCTION_CONTENT_SECURITY_POLICY}">`
        );
        if (html.includes("Content-Security-Policy")) {
          return html;
        }
        return html.replace("<head>", `<head>\n  ${cspMeta}`);
      },
    },
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 300_000,
  },
});
