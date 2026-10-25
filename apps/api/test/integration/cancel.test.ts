import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeCheckoutSuccess, setPaymentGatewayForTests, paymentGateway } from "../../src/adapters/payments.js";
import { prisma } from "../../src/db.js";
import { cancelBooking, cancelPreview, createBooking } from "../../src/services/bookings.js";
import { createPaymentOrder, verifyPayment } from "../../src/services/payments.js";
import { retryRefund } from "../../src/services/refunds.js";
import { cancelRide } from "../../src/services/rides.js";
import { bookingBody, makeCustomer, makeDriver, makeRide, resetDb, seedBasics, setDeparture, type Basics } from "./helpers.js";

let b: Basics;
beforeEach(async () => {
  await resetDb();
  b = await seedBasics();
});
afterEach(() => setPaymentGatewayForTests(undefined));

async function paidBooking(seats: number, ride?: { id: string }) {
  const r = ride ?? (await makeRide(b, await makeDriver(b)));
  const c = await makeCustomer();
  const bk = await createBooking(c.id, bookingBody(b, r.id, seats));
  const order = await createPaymentOrder(bk.id, c.id);
  await verifyPayment(c.id, { bookingId: bk.id, ...fakeCheckoutSuccess(order.orderId) });
  return { ride: r, c, bk };
}

describe("customer cancellation and tiered refunds", () => {
  it.each([
    [30, 100, 110_000],
    [13, 75, 82_500],
    [5, 50, 55_000],
  ])("%s hours before departure refunds %s%%", async (hours, percent, amount) => {
    const { ride, c, bk } = await paidBooking(2);
    await setDeparture(ride.id, hours);

    const preview = await cancelPreview(bk.id, c.id);
    expect(preview).toMatchObject({ cancellable: true, refundPercent: percent, refundAmount: amount });

    const result = await cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "Plans changed" });
    expect(result.refundAmount).toBe(amount);
    expect(result.refund).toMatchObject({ amount, percent, status: "PROCESSED" });

    const after = await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
    expect(after.availableSeats).toBe(6);
  });

  it("under 4 hours: no refund, but the seats still go back", async () => {
    const { ride, c, bk } = await paidBooking(1);
    await setDeparture(ride.id, 2);
    const result = await cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "Late" });
    expect(result.refundAmount).toBe(0);
    expect(result.refund).toBeNull();
    expect(await prisma.refund.count()).toBe(0);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).availableSeats).toBe(6);
  });

  it("a customer can't cancel someone else's booking or cancel twice", async () => {
    const { c, bk } = await paidBooking(1);
    const stranger = await makeCustomer();
    await expect(cancelBooking(bk.id, { type: "CUSTOMER", id: stranger.id }, { reason: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "x" });
    await expect(cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "x" })).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
  });

  it("cancelling an unpaid hold just releases the seats", async () => {
    const ride = await makeRide(b, await makeDriver(b));
    const c = await makeCustomer();
    const bk = await createBooking(c.id, bookingBody(b, ride.id, 3));
    await cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "Changed my mind" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe("CANCELLED");
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).availableSeats).toBe(6);
  });
});

describe("driver and admin cancellation", () => {
  it("driver cancelling the ride refunds every customer 100%, even close to departure", async () => {
    const ride = await makeRide(b, await makeDriver(b));
    const one = await paidBooking(2, ride);
    const two = await paidBooking(1, ride);
    const held = await createBooking((await makeCustomer()).id, bookingBody(b, ride.id, 1));
    await setDeparture(ride.id, 1);

    const driverUserId = (await prisma.ride.findUniqueOrThrow({ where: { id: ride.id }, include: { driver: true } })).driver.userId;
    const r = await cancelRide(ride.id, { type: "DRIVER", id: driverUserId }, "Car broke down");
    expect(r.bookingsCancelled).toBe(2);

    const refunds = await prisma.refund.findMany({ orderBy: { amount: "desc" } });
    expect(refunds.map((x) => [x.amount, x.percent, x.status])).toEqual([
      [one.bk.fare.total, 100, "PROCESSED"],
      [two.bk.fare.total, 100, "PROCESSED"],
    ]);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("CANCELLED");
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).status).toBe("CANCELLED");
  });

  it("admin FULL refund ignores the tiers; POLICY follows them", async () => {
    const a = await paidBooking(1);
    await setDeparture(a.ride.id, 2);
    const full = await cancelBooking(a.bk.id, { type: "ADMIN", id: "admin-1" }, { reason: "Goodwill", refundMode: "FULL" });
    expect(full.refundAmount).toBe(a.bk.fare.total);

    const p = await paidBooking(1);
    await setDeparture(p.ride.id, 13);
    const policy = await cancelBooking(p.bk.id, { type: "ADMIN", id: "admin-1" }, { reason: "Customer called", refundMode: "POLICY" });
    expect(policy.refundPercent).toBe(75);
  });
});

describe("refund failures", () => {
  it("a gateway failure is recorded and can be retried", async () => {
    const { c, bk } = await paidBooking(1);
    const real = paymentGateway();
    setPaymentGatewayForTests({ ...real, refund: async () => ({ ok: false, error: "Gateway timeout" }) });

    const result = await cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "x" });
    expect(result.refund).toMatchObject({ status: "FAILED", failureReason: "Gateway timeout" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe("CANCELLED");

    setPaymentGatewayForTests(undefined);
    const retried = await retryRefund(result.refund!.id, "admin-1");
    expect(retried).toMatchObject({ status: "PROCESSED", attempts: 2 });
    await expect(retryRefund(result.refund!.id, "admin-1")).rejects.toMatchObject({ code: "REFUND_NOT_FAILED" });
  });
});
