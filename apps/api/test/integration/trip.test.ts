import { beforeEach, describe, expect, it } from "vitest";
import { fakeCheckoutSuccess } from "../../src/adapters/payments.js";
import { prisma } from "../../src/db.js";
import { cancelBooking, createBooking, getTicket } from "../../src/services/bookings.js";
import { createPaymentOrder, verifyPayment } from "../../src/services/payments.js";
import { boardPassenger, completeRide, dropPassenger, getDriverRide, markNoShow } from "../../src/services/trips.js";
import { bookingBody, makeCustomer, makeDriver, makeRide, resetDb, seedBasics, setDeparture, type Basics } from "./helpers.js";

let b: Basics;
beforeEach(async () => {
  await resetDb();
  b = await seedBasics();
});

async function confirmedTrip(seats = 2) {
  const d = await makeDriver(b);
  const ride = await makeRide(b, d, { departureInMinutes: 60 }); // boarding opens 2 h before
  const c = await makeCustomer();
  const bk = await createBooking(c.id, bookingBody(b, ride.id, seats));
  const order = await createPaymentOrder(bk.id, c.id);
  await verifyPayment(c.id, { bookingId: bk.id, ...fakeCheckoutSuccess(order.orderId) });
  const ticket = await getTicket(bk.id, c.id);
  return { d, ride, c, bk, ticket };
}

describe("trip start and stop with a unique OTP per passenger", () => {
  it("boards and drops each passenger with their own codes, then completes the ride", async () => {
    const { d, ride, c, bk, ticket } = await confirmedTrip(2);
    const [p1, p2] = ticket.passengers;
    expect(p1!.startCode).toMatch(/^\d{4}$/);
    expect(p1!.endCode).toBeNull(); // only shown once on board
    expect(p1!.startCode).not.toBe(p2!.startCode);

    // The driver never sees the codes.
    expect(JSON.stringify(await getDriverRide(d.user.id, ride.id))).not.toContain(p1!.startCode!);

    // Another passenger's code doesn't work.
    await expect(boardPassenger(d.user.id, ride.id, p1!.id, p2!.startCode!)).rejects.toMatchObject({ code: "OTP_WRONG", details: { attemptsLeft: 4 } });

    await boardPassenger(d.user.id, ride.id, p1!.id, p1!.startCode!);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).status).toBe("STARTED");
    await expect(boardPassenger(d.user.id, ride.id, p1!.id, p1!.startCode!)).rejects.toMatchObject({ code: "ALREADY_BOARDED" });

    const t2 = await getTicket(bk.id, c.id);
    const end1 = t2.passengers[0]!.endCode!;
    expect(end1).toMatch(/^\d{4}$/);
    expect(t2.passengers[0]!.startCode).toBeNull();

    await boardPassenger(d.user.id, ride.id, p2!.id, p2!.startCode!);
    const t3 = await getTicket(bk.id, c.id);
    expect((await dropPassenger(d.user.id, ride.id, p1!.id, end1)).rideCompleted).toBe(false);
    const last = await dropPassenger(d.user.id, ride.id, p2!.id, t3.passengers[1]!.endCode!);
    expect(last.rideCompleted).toBe(true);

    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).status).toBe("COMPLETED");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe("COMPLETED");
  });

  it("locks a code after 5 wrong tries", async () => {
    const { d, ride, ticket } = await confirmedTrip(1);
    const p = ticket.passengers[0]!;
    const wrong = p.startCode === "1111" ? "2222" : "1111";
    for (let i = 0; i < 5; i++) await expect(boardPassenger(d.user.id, ride.id, p.id, wrong)).rejects.toMatchObject({ code: "OTP_WRONG" });
    await expect(boardPassenger(d.user.id, ride.id, p.id, p.startCode!)).rejects.toMatchObject({ code: "OTP_LOCKED" });
  });

  it("can't drop a passenger who hasn't boarded", async () => {
    const { d, ride, ticket } = await confirmedTrip(1);
    await expect(dropPassenger(d.user.id, ride.id, ticket.passengers[0]!.id, "1234")).rejects.toMatchObject({ code: "NOT_ONBOARD" });
  });

  it("boarding doesn't open more than 2 hours before departure", async () => {
    const { d, ride, ticket } = await confirmedTrip(1);
    await setDeparture(ride.id, 3);
    await expect(boardPassenger(d.user.id, ride.id, ticket.passengers[0]!.id, ticket.passengers[0]!.startCode!)).rejects.toMatchObject({ code: "BOARDING_NOT_OPEN" });
  });

  it("no-shows after departure let the driver finish the trip", async () => {
    const { d, ride, ticket } = await confirmedTrip(2);
    const [p1, p2] = ticket.passengers;
    await expect(markNoShow(d.user.id, ride.id, p2!.id)).rejects.toMatchObject({ code: "TOO_EARLY" });
    await boardPassenger(d.user.id, ride.id, p1!.id, p1!.startCode!);
    await setDeparture(ride.id, -0.1);
    await markNoShow(d.user.id, ride.id, p2!.id);
    await expect(completeRide(d.user.id, ride.id)).rejects.toMatchObject({ code: "PASSENGERS_ONBOARD" });
  });

  it("a booking with a boarded passenger can't be cancelled", async () => {
    const { d, ride, c, bk, ticket } = await confirmedTrip(1);
    await boardPassenger(d.user.id, ride.id, ticket.passengers[0]!.id, ticket.passengers[0]!.startCode!);
    await expect(cancelBooking(bk.id, { type: "CUSTOMER", id: c.id }, { reason: "x" })).rejects.toMatchObject({ code: "TRIP_IN_PROGRESS" });
  });

  it("another driver can't touch this ride", async () => {
    const { ride, ticket } = await confirmedTrip(1);
    const other = await makeDriver(b);
    await expect(boardPassenger(other.user.id, ride.id, ticket.passengers[0]!.id, ticket.passengers[0]!.startCode!)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
