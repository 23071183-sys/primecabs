import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for plain TypeScript helpers. The UI kit is aliased to its formatting module
// so tests never load React Native.
export default defineConfig({
  resolve: {
    alias: {
      "@primecabs/mobile-ui": fileURLToPath(new URL("../../packages/mobile-ui/src/format.ts", import.meta.url)),
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
