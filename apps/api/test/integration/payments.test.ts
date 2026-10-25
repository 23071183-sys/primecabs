import { beforeEach, describe, expect, it } from "vitest";
import { fakeCheckoutSuccess, fakeWebhookSignature } from "../../src/adapters/payments.js";
import { prisma } from "../../src/db.js";
import { createBooking } from "../../src/services/bookings.js";
import { expireStaleHolds } from "../../src/services/holds.js";
import { createPaymentOrder, handleWebhook, verifyPayment } from "../../src/services/payments.js";
import { bookingBody, makeCustomer, makeDriver, makeRide, resetDb, seedBasics, type Basics } from "./helpers.js";

let b: Basics;
beforeEach(async () => {
  await resetDb();
  b = await seedBasics();
});

async function heldBooking(seats = 2, rideSeats = 6) {
  const d = await makeDriver(b);
  const ride = await makeRide(b, d, { seats: rideSeats });
  const c = await makeCustomer();
  const booking = await createBooking(c.id, bookingBody(b, ride.id, seats));
  const order = await createPaymentOrder(booking.id, c.id);
  return { ride, c, booking, order };
}

const capturedEvent = (orderId: string, paymentId: string) =>
  JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });

describe("payment confirmation", () => {
  it("app verify and webhook arriving together confirm the booking exactly once", async () => {
    const { c, booking, order } = await heldBooking(2);
    const pay = fakeCheckoutSuccess(order.orderId);
    const body = capturedEvent(order.orderId, pay.razorpayPaymentId);

    const results = await Promise.all([
      verifyPayment(c.id, { bookingId: booking.id, ...pay }),
      handleWebhook(body, fakeWebhookSignature(body)),
      verifyPayment(c.id, { bookingId: booking.id, ...pay }),
    ]);

    const outcomes = [results[0].outcome, (results[1] as { outcome: string }).outcome, results[2].outcome];
    expect(outcomes.filter((o) => o === "CONFIRMED")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "ALREADY_CONFIRMED")).toHaveLength(2);

    const bk = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { passengers: { include: { tripOtps: true } }, seatHold: true } });
    expect(bk.status).toBe("CONFIRMED");
    expect(bk.seatHold?.status).toBe("CONVERTED");
    for (const p of bk.passengers) expect(p.tripOtps.map((t) => t.purpose).sort()).toEqual(["END", "START"]);
    expect(await prisma.auditLog.count({ where: { action: "booking.confirmed", entityId: booking.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { bookingId: booking.id, status: "PAID" } })).toBe(1);
  });

  it("rejects a forged signature", async () => {
    const { c, booking, order } = await heldBooking(1);
    const pay = fakeCheckoutSuccess(order.orderId);
    await expect(verifyPayment(c.id, { bookingId: booking.id, ...pay, razorpaySignature: "0".repeat(64) })).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
    await expect(handleWebhook(capturedEvent(order.orderId, "pay_x"), "bad")).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("HELD");
  });

  it("trip codes are unique across all passengers on a ride", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d, { seats: 6 });
    for (let i = 0; i < 3; i++) {
      const c = await makeCustomer();
      const bk = await createBooking(c.id, bookingBody(b, ride.id, 2));
      const order = await createPaymentOrder(bk.id, c.id);
      await verifyPayment(c.id, { bookingId: bk.id, ...fakeCheckoutSuccess(order.orderId) });
    }
    const codes = (await prisma.tripOtp.findMany({ where: { rideId: ride.id } })).map((t) => t.code);
    expect(codes).toHaveLength(12);
    expect(new Set(codes).size).toBe(12);
  });

  it("late payment after expiry: re-takes the seats if they are still free", async () => {
    const { c, booking, order } = await heldBooking(2);
    await expireStaleHolds(new Date(Date.now() + 6 * 60_000));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("EXPIRED");

    const r = await verifyPayment(c.id, { bookingId: booking.id, ...fakeCheckoutSuccess(order.orderId) });
    expect(r.outcome).toBe("CONFIRMED");
    expect((await prisma.ride.findFirstOrThrow()).availableSeats).toBe(4);
  });

  it("late payment after expiry: refunds 100% if someone else took the seats", async () => {
    const { ride, c, booking, order } = await heldBooking(1, 1);
    await expireStaleHolds(new Date(Date.now() + 6 * 60_000));
    const other = await makeCustomer();
    await createBooking(other.id, bookingBody(b, ride.id, 1));

    const r = await verifyPayment(c.id, { bookingId: booking.id, ...fakeCheckoutSuccess(order.orderId) });
    expect(r.outcome).toBe("REFUNDED_SEATS_GONE");
    const refund = await prisma.refund.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(refund).toMatchObject({ amount: booking.fare.total, percent: 100, status: "PROCESSED", initiatedBy: "SYSTEM" });
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).availableSeats).toBe(0);
  });

  it("won't create a payment order once the hold has expired", async () => {
    const d = await makeDriver(b);
    const ride = await makeRide(b, d);
    const c = await makeCustomer();
    const bk = await createBooking(c.id, bookingBody(b, ride.id, 1));
    await prisma.booking.update({ where: { id: bk.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await expect(createPaymentOrder(bk.id, c.id)).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
  });
});
