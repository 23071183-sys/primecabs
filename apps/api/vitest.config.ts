import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false, // integration files share one test database
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["test/integration/global-setup.ts"],
          setupFiles: ["test/integration/setup-env.ts"],
          fileParallelism: false, // the files share one test database
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
