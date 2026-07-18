import { defineConfig } from "vite";

/** GitHub Pages project site base, e.g. `/congrads_steg/`. */
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
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
  plugins: [
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
