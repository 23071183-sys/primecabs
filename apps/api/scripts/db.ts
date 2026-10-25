// Runs a local PostgreSQL server for development and tests, with no system install.
// Data lives in apps/api/.pgdata. Keep this running in its own terminal: npm run db:start
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const databaseDir = resolve(import.meta.dirname, "../.pgdata");
const databases = ["primecabs", "primecabs_test"];

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "postgres",
  persistent: true,
  onLog: () => {},
});

if (!existsSync(resolve(databaseDir, "PG_VERSION"))) {
  await pg.initialise();
}
await pg.start();
for (const name of databases) {
  try {
    await pg.createDatabase(name);
  } catch {
    // already exists
  }
}
console.log(`Postgres is running on localhost:${port} (databases: ${databases.join(", ")}). Press Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
