import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError } from "fastify";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { authPlugin } from "./plugins/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { customerRoutes } from "./routes/customer.js";
import { driverRoutes } from "./routes/driver.js";
import { fileRoutes } from "./routes/files.js";
import { publicRoutes } from "./routes/public.js";
import { webhookRoutes } from "./routes/webhooks.js";

export async function buildApp() {
  const c = config();
  const app = Fastify({
    logger: c.NODE_ENV === "test" ? false : { level: "info", redact: ["req.headers.authorization"] },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests. Wait a moment and try again." } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? "BAD_REQUEST", message: err.message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: "SERVER_ERROR", message: "Something went wrong on our side. Try again." } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } }));

  await app.register(cors, {
    origin: c.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    credentials: false,
    // The default is GET, HEAD and POST only; the apps also save with PUT.
    methods: ["GET", "HEAD", "POST", "PUT"],
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin);

  app.get("/health", async () => ({ ok: true }));
  await app.register(
    async (api) => {
      await api.register(publicRoutes);
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(customerRoutes);
      await api.register(driverRoutes, { prefix: "/driver" });
      await api.register(adminRoutes, { prefix: "/admin" });
      await api.register(webhookRoutes, { prefix: "/webhooks" });
      await api.register(fileRoutes, { prefix: "/files" });
    },
    { prefix: "/api/v1" },
  );
  return app;
}
