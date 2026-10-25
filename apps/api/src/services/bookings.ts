// Customer bookings: quote, hold seats, confirm after payment, cancel with refund, e-ticket.
import type { Booking, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type Tx } from "../db.js";
import { BOOKING_SEQ_START, checkBookable, formatBookingCode, holdExpiresAt } from "../domain/booking.js";
import { priceBooking, type PriceBreakdown } from "../domain/fare.js";
import { pickUniqueCodes } from "../domain/otp.js";
import { computeRefund, type CancelledBy } from "../domain/refund.js";
import type { Settings } from "../domain/settings.js";
import { istYYMMDD } from "../domain/time.js";
import { age, gender, indianMobile, personName, uuid } from "../domain/validators.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { audit } from "./audit.js";
import { expireStaleHolds, lockBooking, lockRide, releaseHeldBooking, reserveSeats, returnSeats } from "./holds.js";
import { processRefund } from "./refunds.js";
import { getSettings } from "./settings.js";

const MAX_ACTIVE_HOLDS_PER_CUSTOMER = 2;

const stop = z.union([
  z.object({ pointId: uuid }).strict(),
  z.object({ address: z.string().trim().min(10, "Enter the full address").max(200) }).strict(),
]);

export const quoteInput = z.object({
  rideId: uuid,
  seats: z.number().int().min(1).max(20),
  pickup: stop,
  drop: stop,
});

export const bookingInput = quoteInput.extend({
  passengers: z
    .array(z.object({ name: personName, phone: indianMobile, age, gender }))
    .min(1)
    .max(20),
});

type StopInput = z.infer<typeof stop>;

const rideForBooking = {
  route: { include: { fromCity: { include: { pickupPoints: true } }, toCity: { include: { pickupPoints: true } } } },
  vehicle: { include: { vehicleType: true } },
  driver: { select: { status: true } },
} satisfies Prisma.RideInclude;

type RideForBooking = Prisma.RideGetPayload<{ include: typeof rideForBooking }>;
type CityWithPoints = RideForBooking["route"]["fromCity"];

function resolveStop(city: CityWithPoints, input: StopInput, which: "pickup" | "drop") {
  if ("pointId" in input) {
    const point = city.pickupPoints.find((p) => p.id === input.pointId && p.active);
    if (!point) throw badRequest("INVALID_STOP", `Choose a ${which} point in ${city.name}`);
    return { pointId: point.id, address: null, extra: point.extraFare };
  }
  if (city.type === "HUB" || !city.homePickupAllowed) {
    throw badRequest("HOME_PICKUP_NOT_ALLOWED", `${city.name} has fixed ${which} points only. Choose one from the list.`);
  }
  return { pointId: null, address: input.address, extra: city.homePickupFee };
}

function assertBookable(ride: RideForBooking, settings: Settings, now: Date) {
  if (ride.status === "FULL") throw conflict("SEATS_UNAVAILABLE", "This ride is full", { availableSeats: 0 });
  if (ride.status !== "OPEN" || ride.seatFare === null || ride.driver.status !== "APPROVED") {
    throw conflict("RIDE_NOT_AVAILABLE", "This ride is no longer available");
  }
  const check = checkBookable(ride.departureAt, now, settings.bookingCutoffMinutes, settings.bookingHorizonDays);
  if (check === "DEPARTED" || check === "CLOSED") throw conflict("BOOKING_CLOSED", "Booking for this ride has closed");
  if (check === "TOO_FAR_AHEAD") throw conflict("BOOKING_NOT_OPEN", "Booking for this ride hasn't opened yet");
}

async function loadRide(rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: rideForBooking });
  if (!ride) throw notFound("Ride");
  return ride;
}

function price(ride: RideForBooking, seats: number, pickup: StopInput, drop: StopInput, settings: Settings) {
  const p = resolveStop(ride.route.fromCity, pickup, "pickup");
  const d = resolveStop(ride.route.toCity, drop, "drop");
  const breakdown = priceBooking({
    seatFare: ride.seatFare!,
    seats,
    pickupExtra: p.extra,
    dropExtra: d.extra,
    plateType: ride.vehicle.plateType,
    gst: settings.gst,
    commission: settings.commission,
  });
  return { breakdown, pickup: p, drop: d };
}

/** Customer-facing part of the price (no commission or driver earning). */
export const customerFare = (b: PriceBreakdown | Booking) => ({
  seatFare: b.seatFare,
  seats: b.seats,
  seatsAmount: b.seatsAmount,
  pickupExtra: b.pickupExtra,
  dropExtra: b.dropExtra,
  gstMode: b.gstMode,
  gstRatePercent: b.gstRateBp / 100,
  gstAmount: b.gstAmount,
  total: b.total,
});

export async function quote(input: z.infer<typeof quoteInput>) {
  const settings = await getSettings();
  const now = new Date();
  await expireStaleHolds(now, input.rideId);
  const ride = await loadRide(input.rideId);
  assertBookable(ride, settings, now);
  if (input.seats > ride.availableSeats) {
    throw conflict("SEATS_UNAVAILABLE", `Only ${ride.availableSeats} seats left`, { availableSeats: ride.availableSeats });
  }
  const { breakdown } = price(ride, input.seats, input.pickup, input.drop, settings);
  return { fare: customerFare(breakdown), availableSeats: ride.availableSeats, holdMinutes: settings.seatHoldMinutes };
}

async function nextBookingCode(tx: Tx, now: Date): Promise<string> {
  const day = istYYMMDD(now);
  const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "booking_counters" ("day", "lastSeq") VALUES (${day}, ${BOOKING_SEQ_START})
    ON CONFLICT ("day") DO UPDATE SET "lastSeq" = "booking_counters"."lastSeq" + 1
    RETURNING "lastSeq"`;
  return formatBookingCode(now, rows[0]!.lastSeq);
}

/** Creates a HELD booking and reserves its seats for the hold time (default 5 minutes). */
export async function createBooking(customerId: string, input: z.infer<typeof bookingInput>) {
  if (input.passengers.length !== input.seats) {
    throw badRequest("PASSENGER_COUNT_MISMATCH", `Add details for all ${input.seats} travellers`);
  }
  const settings = await getSettings();
  const now = new Date();

  const customer = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.status !== "ACTIVE") throw forbidden("Your account is blocked. Contact support.");
  if (!customer.name || !customer.email || !customer.age || !customer.gender) {
    throw badRequest("PROFILE_INCOMPLETE", "Complete your profile (name, email, age and gender) before booking");
  }

  await expireStaleHolds(now, input.rideId);
  const activeHolds = await prisma.booking.count({ where: { customerId, status: "HELD", holdExpiresAt: { gt: now } } });
  if (activeHolds >= MAX_ACTIVE_HOLDS_PER_CUSTOMER) {
    throw conflict("TOO_MANY_HOLDS", "Finish or cancel your other unpaid booking first");
  }

  const ride = await loadRide(input.rideId);
  assertBookable(ride, settings, now);
  const { breakdown, pickup, drop } = price(ride, input.seats, input.pickup, input.drop, settings);
  const expiresAt = holdExpiresAt(now, settings.seatHoldMinutes);

  const booking = await prisma.$transaction(async (tx) => {
    if (!(await reserveSeats(tx, ride.id, input.seats))) {
      const fresh = await tx.ride.findUniqueOrThrow({ where: { id: ride.id }, select: { availableSeats: true } });
      throw conflict(
        "SEATS_UNAVAILABLE",
        fresh.availableSeats === 0 ? "Sorry, this ride just filled up" : `Only ${fresh.availableSeats} seats left`,
        { availableSeats: fresh.availableSeats },
      );
    }
    const code = await nextBookingCode(tx, now);
    const { seatFare: _s, seats: _n, ...snapshot } = breakdown;
    return tx.booking.create({
      data: {
        code,
        customerId,
        rideId: ride.id,
        seats: input.seats,
        pickupPointId: pickup.pointId,
        pickupAddress: pickup.address,
        dropPointId: drop.pointId,
        dropAddress: drop.address,
        status: "HELD",
        holdExpiresAt: expiresAt,
        seatFare: breakdown.seatFare,
        ...snapshot,
        passengers: { create: input.passengers },
        seatHold: { create: { rideId: ride.id, seats: input.seats, expiresAt } },
      },
      include: { passengers: true },
    });
  });

  return {
    id: booking.id,
    code: booking.code,
    status: booking.status,
    holdExpiresAt: booking.holdExpiresAt,
    holdSecondsLeft: Math.round((booking.holdExpiresAt.getTime() - Date.now()) / 1000),
    fare: customerFare(booking),
  };
}

async function createTripOtps(tx: Tx, booking: { id: string; rideId: string }) {
  await lockRide(tx, booking.rideId); // serialises code picking on this ride
  const passengers = await tx.passenger.findMany({ where: { bookingId: booking.id }, select: { id: true } });
  const taken = new Set((await tx.tripOtp.findMany({ where: { rideId: booking.rideId }, select: { code: true } })).map((t) => t.code));
  const codes = pickUniqueCodes(passengers.length * 2, taken);
  await tx.tripOtp.createMany({
    data: passengers.flatMap((p, i) => [
      { rideId: booking.rideId, passengerId: p.id, purpose: "START" as const, code: codes[i * 2]! },
      { rideId: booking.rideId, passengerId: p.id, purpose: "END" as const, code: codes[i * 2 + 1]! },
    ]),
  });
}

export type ConfirmOutcome = "CONFIRMED" | "ALREADY_CONFIRMED" | "REFUNDED_SEATS_GONE";

/**
 * Marks a booking paid and confirmed. Safe to call many times and concurrently
 * (app verify + webhook): the booking row is locked and only HELD -> CONFIRMED counts once.
 * If the hold expired before the money arrived, it tries to take the seats again;
 * if they are gone, the customer is refunded in full.
 */
export async function confirmPayment(args: {
  providerOrderId: string;
  providerPaymentId: string;
  source: "app" | "webhook";
  raw?: unknown;
}): Promise<{ bookingId: string; outcome: ConfirmOutcome }> {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: args.providerOrderId } });
  if (!payment) throw notFound("Payment order");

  let refundToProcess: string | null = null;
  const outcome = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, payment.bookingId);
    const now = new Date();
    await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: { status: "PAID", providerPaymentId: args.providerPaymentId, paidAt: now, raw: (args.raw ?? undefined) as Prisma.InputJsonValue },
    });

    const booking = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId }, include: { ride: true } });
    if (booking.status === "CONFIRMED" || booking.status === "COMPLETED") return "ALREADY_CONFIRMED" as const;
    if (booking.status === "CANCELLED" && booking.confirmedAt) return "ALREADY_CONFIRMED" as const; // refunded through cancellation

    let seatsOk = booking.status === "HELD";
    if (!seatsOk) {
      // Hold expired (or was abandoned) before payment completed: try to take the seats again.
      seatsOk = booking.ride.departureAt > now && (await reserveSeats(tx, booking.rideId, booking.seats));
    }
    if (!seatsOk) {
      if (booking.status === "HELD") await tx.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
      const existing = await tx.refund.findFirst({ where: { bookingId: booking.id } });
      if (!existing) {
        const refund = await tx.refund.create({
          data: {
            bookingId: booking.id,
            paymentId: payment.id,
            amount: payment.amount,
            percent: 100,
            tierLabel: "Seats released before payment: 100%",
            reason: "Payment arrived after the seat hold expired and the seats were taken",
            initiatedBy: "SYSTEM",
          },
        });
        refundToProcess = refund.id;
      }
      return "REFUNDED_SEATS_GONE" as const;
    }

    await tx.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED", confirmedAt: now } });
    await tx.seatHold.updateMany({ where: { bookingId: booking.id }, data: { status: "CONVERTED" } });
    await createTripOtps(tx, booking);
    await audit(
      { actorType: "SYSTEM", action: "booking.confirmed", entity: "booking", entityId: booking.id, after: { via: args.source, paymentId: args.providerPaymentId } },
      tx,
    );
    return "CONFIRMED" as const;
  });

  if (refundToProcess) await processRefund(refundToProcess);
  return { bookingId: payment.bookingId, outcome };
}

export interface Actor {
  type: "CUSTOMER" | "DRIVER" | "ADMIN";
  id: string;
}

/** Preview of what the customer gets back if they cancel now. */
export async function cancelPreview(bookingId: string, customerId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { ride: true } });
  if (!booking || booking.customerId !== customerId) throw notFound("Booking");
  const settings = await getSettings();
  if (booking.status === "HELD") return { cancellable: true, refundAmount: 0, refundPercent: 0, tierLabel: "Not paid yet", tiers: settings.refundTiers };
  if (booking.status !== "CONFIRMED") return { cancellable: false, refundAmount: 0, refundPercent: 0, tierLabel: "", tiers: settings.refundTiers };
  const r = computeRefund({ amountPaid: booking.total, departureAt: booking.ride.departureAt, now: new Date(), tiers: settings.refundTiers, cancelledBy: "CUSTOMER" });
  return {
    cancellable: r.hoursBefore > 0,
    hoursBeforeDeparture: Math.max(0, Math.round(r.hoursBefore * 10) / 10),
    refundPercent: r.percent,
    refundAmount: r.amount,
    tierLabel: r.tierLabel,
    tiers: settings.refundTiers,
  };
}

/**
 * Cancels a booking. Unpaid holds are released. Paid bookings get a refund:
 * by tier for the customer (or admin choosing POLICY), 100% for driver or admin FULL.
 */
export async function cancelBooking(
  bookingId: string,
  actor: Actor,
  opts: { reason: string; refundMode?: "POLICY" | "FULL"; ip?: string },
) {
  const existing = await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerId: true, status: true } });
  if (!existing) throw notFound("Booking");
  if (actor.type === "CUSTOMER" && existing.customerId !== actor.id) throw notFound("Booking");

  if (existing.status === "HELD") {
    await releaseHeldBooking(bookingId, "CANCELLED", actor.type, opts.reason);
    return { status: "CANCELLED" as const, refundAmount: 0, refundPercent: 0, tierLabel: "Not paid yet", refund: null };
  }

  const settings = await getSettings();
  let refundId: string | null = null;
  const result = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const b = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { ride: true, passengers: true, payments: { where: { status: "PAID" } } },
    });
    if (b.status !== "CONFIRMED") throw conflict("NOT_CANCELLABLE", "This booking can't be cancelled");
    if (b.passengers.some((p) => p.status !== "BOOKED")) {
      throw conflict("TRIP_IN_PROGRESS", "A passenger has already boarded, so this booking can't be cancelled");
    }
    const now = new Date();
    if (actor.type === "CUSTOMER" && b.ride.departureAt <= now) {
      throw conflict("DEPARTED", "This ride has already departed");
    }
    const cancelledBy: CancelledBy =
      actor.type === "CUSTOMER" || (actor.type === "ADMIN" && opts.refundMode !== "FULL") ? "CUSTOMER" : actor.type;
    const refund = computeRefund({ amountPaid: b.total, departureAt: b.ride.departureAt, now, tiers: settings.refundTiers, cancelledBy });

    await tx.booking.update({
      where: { id: b.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelledBy: actor.type, cancelReason: opts.reason },
    });
    await returnSeats(tx, b.rideId, b.seats);

    const payment = b.payments[0];
    if (refund.amount > 0 && payment) {
      const row = await tx.refund.create({
        data: {
          bookingId: b.id,
          paymentId: payment.id,
          amount: refund.amount,
          percent: refund.percent,
          tierLabel: refund.tierLabel,
          reason: opts.reason,
          initiatedBy: actor.type,
          initiatedById: actor.id,
        },
      });
      refundId = row.id;
    }
    await audit(
      {
        actorType: actor.type,
        actorId: actor.id,
        action: "booking.cancelled",
        entity: "booking",
        entityId: b.id,
        before: { status: "CONFIRMED" },
        after: { status: "CANCELLED", refundAmount: refund.amount, refundPercent: refund.percent, reason: opts.reason },
        ip: opts.ip,
      },
      tx,
    );
    return { status: "CANCELLED" as const, refundAmount: refund.amount, refundPercent: refund.percent, tierLabel: refund.tierLabel };
  });

  const refund = refundId ? await processRefund(refundId) : null;
  return { ...result, refund };
}

const ticketInclude = {
  ride: {
    include: {
      route: { include: { fromCity: true, toCity: true } },
      vehicle: { include: { vehicleType: true } },
      driver: { include: { user: { select: { name: true, phone: true } } } },
    },
  },
  passengers: { include: { tripOtps: true }, orderBy: { createdAt: "asc" } },
  refunds: true,
} satisfies Prisma.BookingInclude;

/** E-ticket for the booking's owner, including each passenger's boarding codes. */
export async function getTicket(bookingId: string, customerId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: ticketInclude });
  if (!b || b.customerId !== customerId) throw notFound("Booking");
  const settings = await getSettings();
  const points = await prisma.pickupPoint.findMany({
    where: { id: { in: [b.pickupPointId, b.dropPointId].filter((x): x is string => !!x) } },
  });
  const pointName = (id: string | null) => points.find((p) => p.id === id)?.name ?? null;
  const confirmed = b.status === "CONFIRMED" || b.status === "COMPLETED";
  const r = b.ride;

  return {
    id: b.id,
    code: b.code,
    status: b.status,
    holdExpiresAt: b.status === "HELD" ? b.holdExpiresAt : null,
    ride: {
      id: r.id,
      from: r.route.fromCity.name,
      to: r.route.toCity.name,
      departureAt: r.departureAt,
      arrivalAt: r.arrivalAt,
      status: r.status,
    },
    pickup: { point: pointName(b.pickupPointId), address: b.pickupAddress },
    drop: { point: pointName(b.dropPointId), address: b.dropAddress },
    driver: confirmed ? { name: r.driver.user.name, phone: r.driver.user.phone } : null,
    vehicle: confirmed
      ? { type: r.vehicle.vehicleType.name, registrationNo: r.vehicle.registrationNo, make: r.vehicle.make, model: r.vehicle.model, colour: r.vehicle.colour }
      : null,
    passengers: b.passengers.map((p) => {
      const start = p.tripOtps.find((t) => t.purpose === "START");
      const end = p.tripOtps.find((t) => t.purpose === "END");
      return {
        id: p.id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        status: p.status,
        // Start code until boarded; end code only once on board (5.10)
        startCode: confirmed && p.status === "BOOKED" ? (start?.code ?? null) : null,
        endCode: confirmed && p.status === "ONBOARD" ? (end?.code ?? null) : null,
      };
    }),
    fare: customerFare(b),
    refunds: b.refunds.map((x) => ({ amount: x.amount, percent: x.percent, status: x.status, createdAt: x.createdAt })),
    cancelledAt: b.cancelledAt,
    support: settings.support,
  };
}

export async function listCustomerBookings(customerId: string, tab: "upcoming" | "past" | "cancelled", page: number, limit: number) {
  const now = new Date();
  const where: Prisma.BookingWhereInput =
    tab === "upcoming"
      ? { customerId, status: { in: ["HELD", "CONFIRMED"] }, ride: { departureAt: { gte: now } } }
      : tab === "past"
        ? { customerId, OR: [{ status: "COMPLETED" }, { status: "CONFIRMED", ride: { departureAt: { lt: now } } }] }
        : { customerId, status: { in: ["CANCELLED", "EXPIRED"] } };
  const [total, rows] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: { ride: { include: { route: { include: { fromCity: true, toCity: true } } } } },
      orderBy: { ride: { departureAt: tab === "upcoming" ? "asc" : "desc" } },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    total,
    page,
    items: rows.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      seats: b.seats,
      total: b.total,
      from: b.ride.route.fromCity.name,
      to: b.ride.route.toCity.name,
      departureAt: b.ride.departureAt,
    })),
  };
}