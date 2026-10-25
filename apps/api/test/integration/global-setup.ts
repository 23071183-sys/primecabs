// Applies migrations to the test database once before the integration tests.
import { execSync } from "node:child_process";
import { resolve } from "node:path";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/primecabs_test";
  execSync("npx prisma migrate deploy", {
    cwd: resolve(import.meta.dirname, "../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
