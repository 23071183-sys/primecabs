import type { FastifyInstance } from "fastify";
import { handleWebhook } from "../services/payments.js";

export async function webhookRoutes(r: FastifyInstance) {
  // The signature is computed over the exact bytes Razorpay sent, so keep the body as a string.
  r.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));

  r.post("/razorpay", { config: { rateLimit: false } }, async (req) => {
    const signature = req.headers["x-razorpay-signature"];
    return handleWebhook(String(req.body ?? ""), typeof signature === "string" ? signature : undefined);
  });
}
