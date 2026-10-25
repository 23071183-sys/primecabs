import { buildApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startHoldExpiryJob } from "./jobs/expireHolds.js";

const app = await buildApp();
const stopJob = startHoldExpiryJob(app.log);

const shutdown = async () => {
  stopJob();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config().PORT, host: "0.0.0.0" });
