import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const g_configDirectory = dirname(fileURLToPath(import.meta.url));

/** GitHub Pages project site base (`/congrats/` on olegutor.github.io/congrats/). */
const basePath = process.env.BASE_PATH ?? "/";

const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

export default defineConfig({
  base: basePath,
  root: ".",
  publicDir: "public",
  build: {
    outDir: "docs",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(g_configDirectory, "app.html"),
    },
  },
  server: {
    port: 5174,
  },
  plugins: [
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
    testTimeout: 120_000,
  },
});
