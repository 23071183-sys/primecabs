// Document storage in the database (STORAGE_PROVIDER=database), used on hosts without a disk.
// config() is read lazily, so setting the variable here applies to this file only.
process.env.STORAGE_PROVIDER = "database";

import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { makeDriver, resetDb, seedBasics } from "./helpers.js";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201d6d9a3f10000000049454e44ae426082",
  "hex",
);

let app: FastifyInstance;
beforeAll(async () => {
  await resetDb();
  app = await buildApp();
});
afterAll(() => app.close());

describe("STORAGE_PROVIDER=database", () => {
  it("stores an upload in the database and serves it through a signed link", async () => {
    const b = await seedBasics();
    const d = await makeDriver(b);
    const type = await prisma.documentType.create({ data: { code: "RC", label: "RC", appliesTo: "VEHICLE" } });
    const token = app.jwt.sign({ sub: d.user.id, kind: "driver" });

    const boundary = "----pc";
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="documentTypeId"\r\n\r\n${type.id}\r\n`),
      Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="vehicleId"\r\n\r\n${d.vehicle.id}\r\n`),
      Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="rc.png"\r\ncontent-type: image/png\r\n\r\n`),
      PNG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: "POST",
      url: "/api/v1/driver/documents",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(up.statusCode).toBe(201);

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: up.json().id } });
    const row = await prisma.storedFile.findUniqueOrThrow({ where: { key: doc.fileKey } });
    expect(Buffer.from(row.data).equals(PNG)).toBe(true);
    expect(existsSync(resolve(import.meta.dirname, "../../storage-test", doc.fileKey))).toBe(false);

    const admin = await prisma.adminUser.create({ data: { email: "s@test.local", name: "S", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash("x", 4) } });
    const adminToken = app.jwt.sign({ sub: admin.id, kind: "admin", role: "SUPER_ADMIN" });
    const link = await app.inject({ method: "GET", url: `/api/v1/admin/documents/${doc.id}/url`, headers: { authorization: `Bearer ${adminToken}` } });
    const url = new URL(link.json().url);
    const file = await app.inject({ method: "GET", url: url.pathname + url.search });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.rawPayload.equals(PNG)).toBe(true);
  });
});
