// Every minute: release seats from unpaid holds whose time ran out.
// Holds are also expired on demand before searches and bookings, so a sleeping server stays correct.
import type { FastifyBaseLogger } from "fastify";
import { expireStaleHolds } from "../services/holds.js";

export function startHoldExpiryJob(log: FastifyBaseLogger, everyMs = 60_000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const n = await expireStaleHolds();
      if (n > 0) log.info({ released: n }, "expired seat holds");
    } catch (err) {
      log.error(err, "hold expiry job failed");
    } finally {
      running = false;
    }
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
