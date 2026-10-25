import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { AppError } from "../../src/errors.js";
import { createBooking } from "../../src/services/bookings.js";
import { expireStaleHolds } from "../../src/services/holds.js";
import { bookingBody, makeCustomer, makeDriver, makeRide, resetDb, seedBasics, type Basics } from "./helpers.js";

let b: Basics;
beforeEach(async () => {
  await resetDb();
  b = await seedBasics();
});

const settle = (ps: Promise<unknown>[]) => Promise.allSettled(ps);
const codeOf = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" && r.reason instanceof AppError ? r.reason.code : null);

describe("atomic seat holds", () => {
  it("20 customers racing for the last seat: exactly one gets it", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { seats: 1 });
    const customers = await Promise.all(Array.from({ length: 20 }, () => makeCustomer()));

    const results = await settle(customers.map((c) => createBooking(c.id, bookingBody(b, ride.id, 1))));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => codeOf(r) === "SEATS_UNAVAILABLE")).toHaveLength(19);
    const after = await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
    expect(after.availableSeats).toBe(0);
    expect(after.status).toBe("FULL");
    expect(await prisma.booking.count({ where: { rideId: ride.id, status: "HELD" } })).toBe(1);
  });

  it("10 parallel 2-seat bookings on a 6-seat ride: exactly 3 succeed, no overbooking", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { seats: 6 });
    const customers = await Promise.all(Array.from({ length: 10 }, () => makeCustomer()));

    const results = await settle(customers.map((c) => createBooking(c.id, bookingBody(b, ride.id, 2))));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const held = await prisma.booking.aggregate({ where: { rideId: ride.id, status: "HELD" }, _sum: { seats: true } });
    expect(held._sum.seats).toBe(6);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).availableSeats).toBe(0);
  });

  it("gives every booking a unique sequential code", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { seats: 6 });
    const customers = await Promise.all(Array.from({ length: 6 }, () => makeCustomer()));
    const made = await Promise.all(customers.map((c) => createBooking(c.id, bookingBody(b, ride.id, 1))));
    const codes = made.map((m) => m.code).sort();
    expect(new Set(codes).size).toBe(6);
    expect(codes[0]).toMatch(/^PC-\d{6}-1001$/);
    expect(codes[5]).toMatch(/-1006$/);
  });

  it("holds for 5 minutes, then the expiry job returns the seats", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { seats: 2 });
    const c = await makeCustomer();
    const booking = await createBooking(c.id, bookingBody(b, ride.id, 2));
    const holdMs = booking.holdExpiresAt.getTime() - Date.now();
    expect(holdMs).toBeGreaterThan(4.9 * 60_000);
    expect(holdMs).toBeLessThanOrEqual(5 * 60_000);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).status).toBe("FULL");

    expect(await expireStaleHolds(new Date())).toBe(0); // not yet
    expect(await expireStaleHolds(new Date(Date.now() + 5 * 60_000 + 1))).toBe(1);

    const after = await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
    expect(after.availableSeats).toBe(2);
    expect(after.status).toBe("OPEN");
    const bk = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { seatHold: true } });
    expect(bk.status).toBe("EXPIRED");
    expect(bk.seatHold?.status).toBe("RELEASED");
  });

  it("uses the admin-edited hold time", async () => {
    await prisma.setting.create({ data: { key: "seatHoldMinutes", value: 10 } });
    const d = await makeDriver(b);
    const ride = await makeRide(b, d);
    const c = await makeCustomer();
    const booking = await createBooking(c.id, bookingBody(b, ride.id, 1));
    expect(booking.holdExpiresAt.getTime() - Date.now()).toBeGreaterThan(9.9 * 60_000);
  });

  it("the database refuses negative or excess seats even if code had a bug", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { seats: 2 });
    await expect(prisma.ride.update({ where: { id: ride.id }, data: { availableSeats: -1 } })).rejects.toThrow();
    await expect(prisma.ride.update({ where: { id: ride.id }, data: { availableSeats: 3 } })).rejects.toThrow();
  });
});

describe("booking rules", () => {
  it("rejects home pickup at a hub and accepts it at a spoke with its fee", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d);
    const c = await makeCustomer();
    const hubHome = { ...bookingBody(b, ride.id, 1), pickup: { address: "12 Civil Lines, Nagpur 440001" } };
    await expect(createBooking(c.id, hubHome)).rejects.toMatchObject({ code: "HOME_PICKUP_NOT_ALLOWED" });

    const spokeHome = { ...bookingBody(b, ride.id, 1), drop: { address: "Near Dalsagar Talab, Seoni" } };
    const ok = await createBooking(c.id, spokeHome);
    expect(ok.fare.dropExtra).toBe(5_000);
    expect(ok.fare.total).toBe(60_000);
  });

  it("adds the airport extra and keeps GST inside the price", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { fare: 50_000 });
    const c = await makeCustomer();
    const body = { ...bookingBody(b, ride.id, 2), pickup: { pointId: b.airport.id } };
    const r = await createBooking(c.id, body);
    expect(r.fare).toMatchObject({ seatsAmount: 100_000, pickupExtra: 10_000, total: 110_000, gstAmount: 5_238, gstMode: "INCLUDED" });
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.commissionAmount).toBe(10_476);
    expect(row.driverEarning).toBe(94_286);
  });

  it("needs one traveller per seat and a complete profile", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d);
    const c = await makeCustomer();
    await expect(createBooking(c.id, { ...bookingBody(b, ride.id, 2), passengers: bookingBody(b, ride.id, 1).passengers })).rejects.toMatchObject({
      code: "PASSENGER_COUNT_MISMATCH",
    });
    const incomplete = await prisma.user.create({ data: { phone: "+919999900000", role: "CUSTOMER" } });
    await expect(createBooking(incomplete.id, bookingBody(b, ride.id, 1))).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
  });

  it("closes booking 15 minutes before departure", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { departureInMinutes: 10 });
    const c = await makeCustomer();
    await expect(createBooking(c.id, bookingBody(b, ride.id, 1))).rejects.toMatchObject({ code: "BOOKING_CLOSED" });
  });

  it("limits a customer to 2 unpaid holds at a time", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d);
    const c = await makeCustomer();
    await createBooking(c.id, bookingBody(b, ride.id, 1));
    await createBooking(c.id, bookingBody(b, ride.id, 1));
    await expect(createBooking(c.id, bookingBody(b, ride.id, 1))).rejects.toMatchObject({ code: "TOO_MANY_HOLDS" });
  });
});
