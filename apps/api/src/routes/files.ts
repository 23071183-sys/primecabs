import type { FastifyInstance } from "fastify";
import { checkSignedFile, readStoredFile } from "../adapters/storage.js";
import { forbidden, notFound } from "../errors.js";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

/** Serves private documents only through signed, expiring links (see adminDocumentUrl). */
export async function fileRoutes(r: FastifyInstance) {
  r.get("/*", async (req, reply) => {
    const key = (req.params as { "*": string })["*"];
    const { exp = "", sig = "" } = req.query as { exp?: string; sig?: string };
    if (!checkSignedFile(key, exp, sig)) throw forbidden("This link has expired");
    const data = await readStoredFile(key).catch(() => {
      throw notFound("File");
    });
    return reply
      .header("content-type", TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream")
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .send(data);
  });
}
