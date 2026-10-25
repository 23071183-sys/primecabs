// The whole Phase 1 loop through the HTTP API, as the three apps will call it.
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { resetDb, seedBasics, type Basics } from "./helpers.js";

let app: FastifyInstance;
let b: Basics;
const PASSWORD = "test-password-123";
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201d6d9a3f10000000049454e44ae426082",
  "hex",
);

beforeAll(async () => {
  await resetDb();
  b = await seedBasics();
  const docTypes = [
    { code: "DRIVING_LICENCE", label: "Driving licence", appliesTo: "DRIVER" as const, hasExpiry: true },
    { code: "TR_LICENCE", label: "TR licence", appliesTo: "DRIVER" as const, requiredIfPlate: "YELLOW" as const },
    { code: "RC", label: "RC", appliesTo: "VEHICLE" as const },
  ];
  for (const d of docTypes) await prisma.documentType.create({ data: d });
  const hash = await bcrypt.hash(PASSWORD, 4);
  await prisma.adminUser.create({ data: { email: "super@test.local", name: "Super", role: "SUPER_ADMIN", passwordHash: hash } });
  await prisma.adminUser.create({ data: { email: "support@test.local", name: "Support", role: "SUPPORT", passwordHash: hash } });
  const other = await prisma.city.create({ data: { name: "Indore", state: "Madhya Pradesh", type: "HUB" } });
  await prisma.adminUser.create({
    data: { email: "indore@test.local", name: "Indore Admin", role: "LOCATION_ADMIN", passwordHash: hash, cityScopes: { create: { cityId: other.id } } },
  });
  app = await buildApp();
});
afterAll(() => app.close());

type Json = Record<string, any>;
async function call(method: "GET" | "POST" | "PUT", url: string, token?: string, body?: unknown) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body as Json } : {}),
  });
  return { status: res.statusCode, body: res.json() as Json };
}

async function upload(token: string, fields: Record<string, string>) {
  const boundary = "----primecabs-test";
  const parts = Object.entries(fields).map(([k, v]) => `--${boundary}\r\ncontent-disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  const payload = Buffer.concat([
    Buffer.from(parts.join("")),
    Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="doc.png"\r\ncontent-type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/driver/documents",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  return { status: res.statusCode, body: res.json() as Json };
}

async function otpLogin(phone: string, appKind: "customer" | "driver") {
  const req = await call("POST", "/auth/otp/request", undefined, { phone, app: appKind });
  expect(req.status).toBe(200);
  expect(req.body.devCode).toMatch(/^\d{6}$/);
  const ver = await call("POST", "/auth/otp/verify", undefined, { phone, otp: req.body.devCode, app: appKind });
  expect(ver.status).toBe(200);
  return ver.body.token as string;
}

async function adminLogin(email: string) {
  const r = await call("POST", "/auth/admin/login", undefined, { email, password: PASSWORD });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

describe("Phase 1 loop over HTTP", () => {
  const s: Json = {};

  it("driver signs up with OTP and completes onboarding", async () => {
    s.driver = await otpLogin("98765 00001", "driver");

    const sub0 = await call("POST", "/driver/submit", s.driver);
    expect(sub0.status).toBe(400);
    expect(sub0.body.error.code).toBe("ONBOARDING_INCOMPLETE");

    const me = await call("PUT", "/driver/me", s.driver, {
      name: "Ramesh Kumar",
      homeCityId: b.nagpur.id,
      bankAccountName: "Ramesh Kumar",
      bankAccountNo: "123456789012",
      bankIfsc: "SBIN0001234",
    });
    expect(me.status).toBe(200);
    expect(me.body.bank.accountNoLast4).toBe("9012");
    expect(JSON.stringify(me.body)).not.toContain("123456789012");

    const bad = await call("POST", "/driver/vehicles", s.driver, { vehicleTypeId: b.ertiga.id, registrationNo: "XYZ", make: "Maruti", model: "Ertiga", year: 2022, colour: "White", plateType: "YELLOW" });
    expect(bad.status).toBe(400);
    const v = await call("POST", "/driver/vehicles", s.driver, { vehicleTypeId: b.ertiga.id, registrationNo: "mh 31 ab 1234", make: "Maruti", model: "Ertiga", year: 2022, colour: "White", plateType: "YELLOW" });
    expect(v.status).toBe(201);
    expect(v.body.registrationNo).toBe("MH31AB1234");
    s.vehicleId = v.body.id;

    const types = (await call("GET", "/document-types")).body as Json[];
    const id = (code: string) => types.find((t) => t.code === code)!.id;
    expect((await upload(s.driver, { documentTypeId: id("DRIVING_LICENCE") })).body.error.code).toBe("EXPIRY_REQUIRED");
    expect((await upload(s.driver, { documentTypeId: id("DRIVING_LICENCE"), expiryDate: "2030-01-01" })).status).toBe(201);
    expect((await upload(s.driver, { documentTypeId: id("RC"), vehicleId: s.vehicleId })).status).toBe(201);

    const missingTr = await call("POST", "/driver/submit", s.driver);
    expect(missingTr.body.error.message).toContain("TR licence"); // yellow plate needs a TR licence
    expect((await upload(s.driver, { documentTypeId: id("TR_LICENCE") })).status).toBe(201);

    const submitted = await call("POST", "/driver/submit", s.driver);
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe("PENDING");
  });

  it("an unapproved driver can't publish", async () => {
    const r = await call("POST", "/driver/rides", s.driver, { vehicleId: s.vehicleId, routeId: b.route.id, departureAt: new Date(Date.now() + 90 * 60_000).toISOString(), totalSeats: 6, seatFare: 55_000 });
    expect(r.status).toBe(403);
  });

  it("admin reviews documents through short-lived links and approves the driver", async () => {
    s.super = await adminLogin("super@test.local");
    s.support = await adminLogin("support@test.local");
    s.indore = await adminLogin("indore@test.local");

    const list = await call("GET", "/admin/drivers?status=PENDING", s.super);
    expect(list.body.items).toHaveLength(1);
    s.driverId = list.body.items[0].id;

    // A location admin for another city can't see this driver.
    expect((await call("GET", `/admin/drivers/${s.driverId}`, s.indore)).status).toBe(404);
    // Support can look but not approve.
    expect((await call("GET", `/admin/drivers/${s.driverId}`, s.support)).status).toBe(200);
    expect((await call("POST", `/admin/drivers/${s.driverId}/approve`, s.support)).status).toBe(403);

    const detail = await call("GET", `/admin/drivers/${s.driverId}`, s.super);
    const docId = detail.body.documents[0].id;
    const link = await call("GET", `/admin/documents/${docId}/url`, s.super);
    const path = new URL(link.body.url).pathname + new URL(link.body.url).search;
    const file = await app.inject({ method: "GET", url: path });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    const tampered = await app.inject({ method: "GET", url: path.replace(/sig=[^&]+/, "sig=forged") });
    expect(tampered.statusCode).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: "document.viewed", entityId: docId } })).toBe(1);

    const ok = await call("POST", `/admin/drivers/${s.driverId}/approve`, s.super);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("APPROVED");
    expect(ok.body.vehicles[0].status).toBe("APPROVED");
  });

  it("driver publishes a ride with a fare; it stays hidden until admin approves the fare", async () => {
    const departureAt = new Date(Date.now() + 90 * 60_000).toISOString();
    const tooMany = await call("POST", "/driver/rides", s.driver, { vehicleId: s.vehicleId, routeId: b.route.id, departureAt, totalSeats: 7, seatFare: 60_000 });
    expect(tooMany.body.error.code).toBe("TOO_MANY_SEATS");

    const r = await call("POST", "/driver/rides", s.driver, { vehicleId: s.vehicleId, routeId: b.route.id, departureAt, totalSeats: 6, seatFare: 60_000 });
    expect(r.status).toBe(201);
    expect(r.body.ride.status).toBe("PENDING_APPROVAL");
    expect(r.body.returnSuggestion.routeId).toBe(b.back.id);
    s.rideId = r.body.ride.id;

    const overlap = await call("POST", "/driver/rides", s.driver, { vehicleId: s.vehicleId, routeId: b.route.id, departureAt, totalSeats: 6, seatFare: 60_000 });
    expect(overlap.body.error.code).toBe("RIDE_OVERLAP");

    const date = new Date(Date.now() + 330 * 60_000 + 90 * 60_000).toISOString().slice(0, 10);
    s.search = `/rides/search?fromCityId=${b.nagpur.id}&toCityId=${b.seoni.id}&date=${date}&seats=2`;
    expect((await call("GET", s.search)).body.items).toHaveLength(0);

    const queue = await call("GET", "/admin/rides?status=PENDING_APPROVAL", s.super);
    expect(queue.body.items[0]).toMatchObject({ id: s.rideId, proposedSeatFare: 60_000 });

    const approved = await call("POST", `/admin/rides/${s.rideId}/approve`, s.super, { seatFare: 55_000 });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "OPEN", seatFare: 55_000 });
    const fa = await prisma.fareApproval.findFirstOrThrow({ where: { rideId: s.rideId } });
    expect(fa).toMatchObject({ decision: "CHANGED", approvedFare: 55_000 });

    const found = await call("GET", s.search);
    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0]).toMatchObject({ seatFare: 55_000, availableSeats: 6, available: true });
  });

  it("customer books with a hold, pays in test mode and gets an e-ticket", async () => {
    s.customer = await otpLogin("9876500002", "customer");
    // A driver's number can't sign in to the customer app.
    expect((await call("POST", "/auth/otp/request", undefined, { phone: "9876500001", app: "customer" })).body.error.code).toBe("PHONE_USED_BY_OTHER_APP");

    const body = {
      rideId: s.rideId,
      seats: 2,
      pickup: { pointId: b.airport.id },
      drop: { address: "House 12, Barapathar, Seoni" },
      passengers: [
        { name: "Anita Sharma", phone: "9812345678", age: 34, gender: "FEMALE" },
        { name: "Rahul Sharma", phone: "9812345679", age: 36, gender: "MALE" },
      ],
    };
    expect((await call("POST", "/bookings", s.customer, body)).body.error.code).toBe("PROFILE_INCOMPLETE");
    expect((await call("PUT", "/me", s.customer, { name: "Anita Sharma", email: "anita@example.com", age: 34, gender: "FEMALE" })).status).toBe(200);

    const q = await call("POST", "/bookings/quote", s.customer, { rideId: s.rideId, seats: 2, pickup: body.pickup, drop: body.drop });
    expect(q.body.fare).toMatchObject({ seatsAmount: 110_000, pickupExtra: 10_000, dropExtra: 5_000, total: 125_000, gstAmount: 5_952 });
    expect(q.body.fare).not.toHaveProperty("commissionAmount");

    const booked = await call("POST", "/bookings", s.customer, body);
    expect(booked.status).toBe(201);
    expect(booked.body.holdSecondsLeft).toBeGreaterThan(290);
    s.bookingId = booked.body.id;

    const order = await call("POST", `/bookings/${s.bookingId}/pay`, s.customer);
    expect(order.body).toMatchObject({ provider: "FAKE", amount: 125_000, currency: "INR" });
    const checkout = await call("POST", "/payments/fake-checkout", s.customer, { bookingId: s.bookingId, orderId: order.body.orderId });
    const verified = await call("POST", "/payments/verify", s.customer, { bookingId: s.bookingId, ...checkout.body });
    expect(verified.body.outcome).toBe("CONFIRMED");

    const ticket = await call("GET", `/bookings/${s.bookingId}`, s.customer);
    expect(ticket.body).toMatchObject({ status: "CONFIRMED", driver: { name: "Ramesh Kumar" }, vehicle: { registrationNo: "MH31AB1234" } });
    expect(ticket.body.code).toMatch(/^PC-\d{6}-1001$/);
    expect(ticket.body.passengers.every((p: Json) => /^\d{4}$/.test(p.startCode))).toBe(true);
    s.passengers = ticket.body.passengers;

    // Another customer can't open this ticket.
    const stranger = await otpLogin("9876500003", "customer");
    expect((await call("GET", `/bookings/${s.bookingId}`, stranger)).status).toBe(404);
    // A customer token can't reach admin or driver routes.
    expect((await call("GET", "/admin/drivers", s.customer)).status).toBe(403);
    expect((await call("GET", "/driver/me", s.customer)).status).toBe(403);
  });

  it("driver starts and ends each passenger with their own OTP", async () => {
    const trip = await call("GET", `/driver/rides/${s.rideId}`, s.driver);
    expect(trip.body.passengers).toHaveLength(2);
    expect(trip.body.earnings).toBeGreaterThan(0);

    for (const p of s.passengers) {
      const start = await call("POST", `/driver/rides/${s.rideId}/passengers/${p.id}/start`, s.driver, { otp: p.startCode });
      expect(start.body.status).toBe("ONBOARD");
    }
    const ticket = await call("GET", `/bookings/${s.bookingId}`, s.customer);
    let last: Json = {};
    for (const p of ticket.body.passengers) {
      expect(p.endCode).toMatch(/^\d{4}$/);
      last = (await call("POST", `/driver/rides/${s.rideId}/passengers/${p.id}/end`, s.driver, { otp: p.endCode })).body;
    }
    expect(last.rideCompleted).toBe(true);
    expect((await call("GET", `/bookings/${s.bookingId}`, s.customer)).body.status).toBe("COMPLETED");
  });

  it("customer cancels another booking and sees the tiered refund", async () => {
    const departureAt = new Date(Date.now() + 30 * 3_600_000);
    const ride = await prisma.ride.create({
      data: {
        driverId: s.driverId,
        vehicleId: s.vehicleId,
        routeId: b.route.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 165 * 60_000),
        totalSeats: 4,
        availableSeats: 4,
        proposedSeatFare: 50_000,
        seatFare: 50_000,
        status: "OPEN",
      },
    });
    const booked = await call("POST", "/bookings", s.customer, {
      rideId: ride.id,
      seats: 1,
      pickup: { pointId: b.station.id },
      drop: { pointId: b.busStand.id },
      passengers: [{ name: "Anita Sharma", phone: "9812345678", age: 34, gender: "FEMALE" }],
    });
    const order = await call("POST", `/bookings/${booked.body.id}/pay`, s.customer);
    const checkout = await call("POST", "/payments/fake-checkout", s.customer, { bookingId: booked.body.id, orderId: order.body.orderId });
    await call("POST", "/payments/verify", s.customer, { bookingId: booked.body.id, ...checkout.body });

    const preview = await call("GET", `/bookings/${booked.body.id}/cancel-preview`, s.customer);
    expect(preview.body).toMatchObject({ cancellable: true, refundPercent: 100, refundAmount: 50_000 });
    const cancelled = await call("POST", `/bookings/${booked.body.id}/cancel`, s.customer, { reason: "Plans changed" });
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", refundAmount: 50_000, refund: { status: "PROCESSED" } });
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).availableSeats).toBe(4);

    const tabs = await call("GET", "/bookings?tab=cancelled", s.customer);
    expect(tabs.body.items.map((x: Json) => x.id)).toContain(booked.body.id);
  });

  it("only a super admin can change settings, and changes are validated and audited", async () => {
    expect((await call("PUT", "/admin/settings/seatHoldMinutes", s.support, { value: 7 })).status).toBe(403);
    expect((await call("PUT", "/admin/settings/seatHoldMinutes", s.super, { value: 0 })).status).toBe(400);
    const ok = await call("PUT", "/admin/settings/gst", s.super, { value: { mode: "ADDED", ratePercent: 5 } });
    expect(ok.status).toBe(200);
    expect((await call("GET", "/config")).body.gst).toEqual({ mode: "ADDED", ratePercent: 5 });
    expect(await prisma.auditLog.count({ where: { action: "setting.update", entityId: "gst" } })).toBe(1);
  });

  it("returns one error shape for bad input and unknown routes", async () => {
    const bad = await call("POST", "/auth/otp/request", undefined, { phone: "12345", app: "customer" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: "VALIDATION_FAILED", message: "Enter a valid 10-digit Indian mobile number" });
    expect((await call("GET", "/nope")).body.error.code).toBe("NOT_FOUND");
  });
});
