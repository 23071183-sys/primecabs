import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    // In development the portal calls the API through this proxy, so no CORS setup is needed.
    proxy: { "/api": "http://localhost:4000" },
  },
  test: { environment: "jsdom", setupFiles: ["test/setup.ts"], css: false },
});
