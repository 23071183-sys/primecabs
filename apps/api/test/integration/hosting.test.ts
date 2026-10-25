// Regression tests for bugs found while running the apps outside the dev proxy,
// and for the settings Render deployment relies on.
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { decodeKey, parseOrigins } from "../../src/config.js";
import { decrypt, encrypt } from "../../src/services/crypto.js";
import { makeDriver, resetDb, seedBasics, type Basics } from "./helpers.js";

let app: FastifyInstance;
let b: Basics;

beforeAll(async () => {
  await resetDb();
  b = await seedBasics();
  app = await buildApp();
});
afterAll(() => app.close());

describe("CORS for apps on their own domain", () => {
  it("allows PUT from an allowed origin (the admin portal and driver app save with PUT)", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/driver/me",
      headers: { origin: "http://localhost:5173", "access-control-request-method": "PUT", "access-control-request-headers": "authorization,content-type" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(String(res.headers["access-control-allow-methods"])).toContain("PUT");
  });

  it("does not allow other origins", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/driver/me",
      headers: { origin: "https://evil.example", "access-control-request-method": "PUT" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("adds https:// to bare hostnames (Render passes service hosts without a scheme)", () => {
    expect(parseOrigins("primecabs-admin.onrender.com, http://localhost:5173/")).toEqual(["https://primecabs-admin.onrender.com", "http://localhost:5173"]);
  });
});

describe("encryption key formats", () => {
  it("accepts 64 hex characters and Render's base64 keys, and rejects anything else", () => {
    expect(decodeKey("0".repeat(64))?.length).toBe(32);
    expect(decodeKey(Buffer.alloc(32, 7).toString("base64"))?.length).toBe(32);
    expect(decodeKey("too-short")).toBeNull();
  });
  it("round-trips a bank account number", () => {
    expect(decrypt(encrypt("123456789012"))).toBe("123456789012");
  });
});

describe("GET /driver/reference-fare", () => {
  it("returns the route's reference fare and the driver's per-seat earning from the shared pricing code", async () => {
    const { prisma } = await import("../../src/db.js");
    const d = await makeDriver(b, { plate: "YELLOW" });
    await prisma.routeFare.create({ data: { routeId: b.route.id, vehicleTypeId: b.ertiga.id, referenceSeatFare: 55_000 } });
    const token = app.jwt.sign({ sub: d.user.id, kind: "driver" });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver/reference-fare?routeId=${b.route.id}&vehicleId=${d.vehicle.id}&seatFare=52000`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      referenceSeatFare: 55_000,
      passengerSeats: 6,
      // ₹520 with 5% GST included: GST ₹24.76, 10% yellow-plate fee on ₹495.24 = ₹49.52, driver keeps ₹445.72
      perSeat: { customerPays: 52_000, gst: 2_476, commission: 4_952, commissionPercent: 10, driverEarns: 44_572 },
    });
  });

  it("won't reveal another driver's vehicle", async () => {
    const mine = await makeDriver(b);
    const theirs = await makeDriver(b);
    const token = app.jwt.sign({ sub: mine.user.id, kind: "driver" });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver/reference-fare?routeId=${b.route.id}&vehicleId=${theirs.vehicle.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
