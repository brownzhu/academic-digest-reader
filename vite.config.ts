import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "emit-extension-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: readFileSync(resolve(projectRoot, "manifest.json"), "utf8"),
        });
      },
    },
  ],
  build: {
    // The side panel has no dynamic chunks. Disabling Vite's preload polyfill
    // keeps the production bundle free of even local-only fetch() calls.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(projectRoot, "sidepanel.html"),
        "service-worker": resolve(projectRoot, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
