// Rides: drivers publish with a proposed fare, admin approves the fare, customers search.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { checkBookable, rangesOverlap } from "../domain/booking.js";
import { addMinutes, istDayRange } from "../domain/time.js";
import { isoDate, rupeesToPaise, uuid } from "../domain/validators.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { audit } from "./audit.js";
import { cancelBooking, type Actor } from "./bookings.js";
import { expireStaleHolds, releaseHeldBooking } from "./holds.js";
import { getSettings } from "./settings.js";

const ACTIVE_RIDE: Prisma.EnumRideStatusFilter = { in: ["PENDING_APPROVAL", "OPEN", "FULL", "STARTED"] };

export const rideInput = z.object({
  vehicleId: uuid,
  routeId: uuid,
  departureAt: z.coerce.date(),
  totalSeats: z.number().int().min(1).max(30),
  seatFare: rupeesToPaise, // paise per seat, proposed by the driver
  notes: z.string().trim().max(300).optional(),
});

export const rideUpdate = rideInput.omit({ vehicleId: true, routeId: true }).partial();

async function approvedDriverForUser(userId: string) {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw notFound("Driver profile");
  if (driver.status !== "APPROVED") throw forbidden("Your profile must be approved before you can publish rides");
  return driver;
}

async function assertNoOverlap(driverId: string, start: Date, end: Date, ignoreRideId?: string) {
  const others = await prisma.ride.findMany({
    where: { driverId, status: ACTIVE_RIDE, id: ignoreRideId ? { not: ignoreRideId } : undefined, departureAt: { lt: end }, arrivalAt: { gt: start } },
    select: { id: true, departureAt: true, arrivalAt: true },
  });
  const clash = others.find((r) => rangesOverlap(start, end, r.departureAt, r.arrivalAt));
  if (clash) throw conflict("RIDE_OVERLAP", "You already have a ride at this time", { rideId: clash.id });
}

function assertDepartureAllowed(departureAt: Date, settings: Awaited<ReturnType<typeof getSettings>>) {
  const now = new Date();
  const check = checkBookable(departureAt, now, settings.bookingCutoffMinutes, settings.bookingHorizonDays);
  if (check === "DEPARTED" || check === "CLOSED") {
    throw badRequest("DEPARTURE_TOO_SOON", `Departure must be at least ${settings.bookingCutoffMinutes} minutes from now`);
  }
  if (check === "TOO_FAR_AHEAD") throw badRequest("DEPARTURE_TOO_FAR", `You can publish up to ${settings.bookingHorizonDays} days ahead`);
}

export async function createRide(userId: string, input: z.infer<typeof rideInput>) {
  const driver = await approvedDriverForUser(userId);
  const settings = await getSettings();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, include: { vehicleType: true } });
  if (!vehicle || vehicle.driverId !== driver.id) throw notFound("Vehicle");
  if (vehicle.status !== "APPROVED") throw forbidden("This vehicle is waiting for approval");
  if (input.totalSeats > vehicle.vehicleType.passengerSeats) {
    throw badRequest("TOO_MANY_SEATS", `A ${vehicle.vehicleType.name} can carry at most ${vehicle.vehicleType.passengerSeats} passengers`);
  }
  const route = await prisma.route.findUnique({ where: { id: input.routeId } });
  if (!route || !route.active) throw notFound("Route");
  assertDepartureAllowed(input.departureAt, settings);
  const arrivalAt = addMinutes(input.departureAt, route.durationMinutes);
  await assertNoOverlap(driver.id, input.departureAt, arrivalAt);

  const ride = await prisma.ride.create({
    data: {
      driverId: driver.id,
      vehicleId: vehicle.id,
      routeId: route.id,
      departureAt: input.departureAt,
      arrivalAt,
      totalSeats: input.totalSeats,
      availableSeats: input.totalSeats,
      proposedSeatFare: input.seatFare,
      notes: input.notes ?? null,
      status: "PENDING_APPROVAL",
      fareApprovals: { create: { proposedFare: input.seatFare } },
    },
  });
  await audit({ actorType: "DRIVER", actorId: userId, action: "ride.published", entity: "ride", entityId: ride.id, after: ride });

  // 2.5: offer the return journey, pre-filled.
  const reverse = await prisma.route.findUnique({ where: { fromCityId_toCityId: { fromCityId: route.toCityId, toCityId: route.fromCityId } } });
  return {
    ride,
    returnSuggestion:
      reverse && reverse.active
        ? { routeId: reverse.id, vehicleId: vehicle.id, earliestDepartureAt: addMinutes(arrivalAt, 30), totalSeats: input.totalSeats, seatFare: input.seatFare }
        : null,
  };
}

/** Drivers can edit a ride only while nobody has booked it. A fare change goes back for approval. */
export async function updateRide(userId: string, rideId: string, input: z.infer<typeof rideUpdate>) {
  const driver = await approvedDriverForUser(userId);
  const settings = await getSettings();
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { vehicle: { include: { vehicleType: true } }, route: true } });
  if (!ride || ride.driverId !== driver.id) throw notFound("Ride");
  if (!["PENDING_APPROVAL", "REJECTED", "OPEN"].includes(ride.status)) throw conflict("RIDE_LOCKED", "This ride can no longer be edited");
  const bookings = await prisma.booking.count({ where: { rideId, status: { in: ["HELD", "CONFIRMED", "COMPLETED"] } } });
  if (bookings > 0) throw conflict("RIDE_HAS_BOOKINGS", "This ride has bookings. Cancel it instead if plans changed.");

  const departureAt = input.departureAt ?? ride.departureAt;
  const totalSeats = input.totalSeats ?? ride.totalSeats;
  if (totalSeats > ride.vehicle.vehicleType.passengerSeats) {
    throw badRequest("TOO_MANY_SEATS", `A ${ride.vehicle.vehicleType.name} can carry at most ${ride.vehicle.vehicleType.passengerSeats} passengers`);
  }
  if (input.departureAt) {
    assertDepartureAllowed(departureAt, settings);
    await assertNoOverlap(driver.id, departureAt, addMinutes(departureAt, ride.route.durationMinutes), ride.id);
  }
  const fareChanged = input.seatFare !== undefined && input.seatFare !== (ride.seatFare ?? ride.proposedSeatFare);
  const needsApproval = fareChanged || ride.status === "REJECTED";

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.ride.update({
      where: { id: ride.id },
      data: {
        departureAt,
        arrivalAt: addMinutes(departureAt, ride.route.durationMinutes),
        totalSeats,
        availableSeats: totalSeats,
        notes: input.notes ?? ride.notes,
        ...(needsApproval ? { status: "PENDING_APPROVAL", proposedSeatFare: input.seatFare ?? ride.proposedSeatFare, seatFare: null } : {}),
      },
    });
    if (needsApproval) await tx.fareApproval.create({ data: { rideId: ride.id, proposedFare: r.proposedSeatFare } });
    return r;
  });
  await audit({ actorType: "DRIVER", actorId: userId, action: "ride.updated", entity: "ride", entityId: ride.id, before: ride, after: updated });
  return updated;
}

/** Cancels a ride. Unpaid holds are released and every paid booking is refunded 100%. */
export async function cancelRide(rideId: string, actor: Actor, reason: string, ip?: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { driver: true } });
  if (!ride) throw notFound("Ride");
  if (actor.type === "DRIVER" && ride.driver.userId !== actor.id) throw notFound("Ride");

  const changed = await prisma.ride.updateMany({
    where: { id: rideId, status: { in: ["PENDING_APPROVAL", "REJECTED", "OPEN", "FULL"] } },
    data: { status: "CANCELLED", cancelReason: reason, cancelledAt: new Date() },
  });
  if (changed.count === 0) throw conflict("RIDE_NOT_CANCELLABLE", "A ride that has started or finished can't be cancelled");
  await audit({ actorType: actor.type, actorId: actor.id, action: "ride.cancelled", entity: "ride", entityId: rideId, before: { status: ride.status }, after: { status: "CANCELLED", reason }, ip });

  const bookings = await prisma.booking.findMany({ where: { rideId, status: { in: ["HELD", "CONFIRMED"] } }, select: { id: true, status: true } });
  const results = [];
  for (const b of bookings) {
    if (b.status === "HELD") {
      await releaseHeldBooking(b.id, "CANCELLED", actor.type, reason);
    } else {
      results.push(await cancelBooking(b.id, actor, { reason: `Ride cancelled: ${reason}`, refundMode: "FULL", ip }));
    }
  }
  return { rideId, status: "CANCELLED" as const, bookingsCancelled: results.length };
}

export async function approveRide(rideId: string, adminId: string, seatFare: number | undefined, ip?: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { driver: true, vehicle: true } });
  if (!ride) throw notFound("Ride");
  if (ride.status !== "PENDING_APPROVAL") throw conflict("NOT_PENDING", "This ride isn't waiting for approval");
  if (ride.driver.status !== "APPROVED" || ride.vehicle.status !== "APPROVED") {
    throw conflict("DRIVER_NOT_APPROVED", "Approve the driver and vehicle first");
  }
  if (ride.departureAt <= new Date()) throw conflict("DEPARTED", "This ride's departure time has passed");
  const fare = seatFare ?? ride.proposedSeatFare;

  const updated = await prisma.$transaction(async (tx) => {
    const ok = await tx.ride.updateMany({
      where: { id: rideId, status: "PENDING_APPROVAL" },
      data: { status: "OPEN", seatFare: fare, availableSeats: ride.totalSeats },
    });
    if (ok.count === 0) throw conflict("NOT_PENDING", "This ride isn't waiting for approval");
    await tx.fareApproval.updateMany({
      where: { rideId, decision: "PENDING" },
      data: { decision: fare === ride.proposedSeatFare ? "APPROVED" : "CHANGED", approvedFare: fare, decidedById: adminId, decidedAt: new Date() },
    });
    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });
  await audit({ actorType: "ADMIN", actorId: adminId, action: "ride.approved", entity: "ride", entityId: rideId, before: { proposedSeatFare: ride.proposedSeatFare }, after: { seatFare: fare }, ip });
  return updated;
}

export async function rejectRide(rideId: string, adminId: string, reason: string, ip?: string) {
  const ok = await prisma.ride.updateMany({ where: { id: rideId, status: "PENDING_APPROVAL" }, data: { status: "REJECTED" } });
  if (ok.count === 0) throw conflict("NOT_PENDING", "This ride isn't waiting for approval");
  await prisma.fareApproval.updateMany({ where: { rideId, decision: "PENDING" }, data: { decision: "REJECTED", reason, decidedById: adminId, decidedAt: new Date() } });
  await audit({ actorType: "ADMIN", actorId: adminId, action: "ride.rejected", entity: "ride", entityId: rideId, after: { reason }, ip });
  return prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
}

export const searchInput = z.object({
  fromCityId: uuid,
  toCityId: uuid,
  date: isoDate,
  seats: z.coerce.number().int().min(1).max(20).default(1),
});

/** Approved rides on a route for an IST date. Full rides are returned as unavailable, not hidden. */
export async function searchRides(q: z.infer<typeof searchInput>) {
  if (q.fromCityId === q.toCityId) throw badRequest("SAME_CITY", "Choose different From and To cities");
  const settings = await getSettings();
  const now = new Date();
  let range;
  try {
    range = istDayRange(q.date);
  } catch {
    throw badRequest("INVALID_DATE", "Choose a valid date");
  }
  const route = await prisma.route.findUnique({ where: { fromCityId_toCityId: { fromCityId: q.fromCityId, toCityId: q.toCityId } } });
  if (!route || !route.active) return { routeId: null, items: [] };
  await expireStaleHolds(now);

  const rides = await prisma.ride.findMany({
    where: {
      routeId: route.id,
      status: { in: ["OPEN", "FULL"] },
      departureAt: { gte: range.start, lt: range.end },
      driver: { status: "APPROVED" },
    },
    include: { vehicle: { include: { vehicleType: true } }, driver: { include: { user: { select: { name: true } } } } },
    orderBy: { departureAt: "asc" },
  });

  return {
    routeId: route.id,
    distanceKm: route.distanceKm,
    items: rides
      .map((r) => {
        const window = checkBookable(r.departureAt, now, settings.bookingCutoffMinutes, settings.bookingHorizonDays);
        const reason =
          window === "DEPARTED" || window === "CLOSED"
            ? "BOOKING_CLOSED"
            : window === "TOO_FAR_AHEAD"
              ? "BOOKING_NOT_OPEN"
              : r.status === "FULL" || r.availableSeats === 0
                ? "FULL"
                : r.availableSeats < q.seats
                  ? "NOT_ENOUGH_SEATS"
                  : null;
        return {
          id: r.id,
          departureAt: r.departureAt,
          arrivalAt: r.arrivalAt,
          durationMinutes: route.durationMinutes,
          seatFare: r.seatFare!,
          availableSeats: r.availableSeats,
          totalSeats: r.totalSeats,
          vehicleType: r.vehicle.vehicleType.name,
          driverFirstName: r.driver.user.name?.split(" ")[0] ?? "Driver",
          available: reason === null,
          unavailableReason: reason,
        };
      })
      .filter((r) => r.unavailableReason !== "BOOKING_CLOSED"),
  };
}

/** Driver's own rides with booking counts and earnings from confirmed bookings. */
export async function listDriverRides(userId: string, scope: "upcoming" | "past") {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw notFound("Driver profile");
  const now = new Date();
  const rides = await prisma.ride.findMany({
    where: { driverId: driver.id, ...(scope === "upcoming" ? { arrivalAt: { gte: now }, status: { notIn: ["COMPLETED"] } } : { OR: [{ arrivalAt: { lt: now } }, { status: "COMPLETED" }] }) },
    include: {
      route: { include: { fromCity: true, toCity: true } },
      vehicle: { include: { vehicleType: true } },
      bookings: { where: { status: { in: ["CONFIRMED", "COMPLETED"] } }, select: { seats: true, driverEarning: true } },
      fareApprovals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { departureAt: scope === "upcoming" ? "asc" : "desc" },
    take: 100,
  });
  return rides.map((r) => ({
    id: r.id,
    routeId: r.routeId,
    from: r.route.fromCity.name,
    to: r.route.toCity.name,
    departureAt: r.departureAt,
    arrivalAt: r.arrivalAt,
    status: r.status,
    cancelReason: r.cancelReason,
    vehicle: { id: r.vehicle.id, type: r.vehicle.vehicleType.name, registrationNo: r.vehicle.registrationNo },
    totalSeats: r.totalSeats,
    availableSeats: r.availableSeats,
    seatsSold: r.bookings.reduce((n, b) => n + b.seats, 0),
    proposedSeatFare: r.proposedSeatFare,
    seatFare: r.seatFare,
    fareDecision: r.fareApprovals[0] ? { decision: r.fareApprovals[0].decision, reason: r.fareApprovals[0].reason } : null,
    earnings: r.bookings.reduce((n, b) => n + b.driverEarning, 0),
  }));
}

export async function driverEarnings(userId: string) {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw notFound("Driver profile");
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await prisma.booking.findMany({
    where: { ride: { driverId: driver.id }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { status: true, seats: true, total: true, gstAmount: true, commissionAmount: true, driverEarning: true, ride: { select: { departureAt: true } } },
  });
  const sum = (since: Date) => rows.filter((b) => b.status === "COMPLETED" && b.ride.departureAt >= since).reduce((n, b) => n + b.driverEarning, 0);
  return {
    last7Days: sum(weekAgo),
    last30Days: sum(monthAgo),
    upcoming: rows.filter((b) => b.status === "CONFIRMED").reduce((n, b) => n + b.driverEarning, 0),
    seatsSoldLast7Days: rows.filter((b) => b.ride.departureAt >= weekAgo).reduce((n, b) => n + b.seats, 0),
  };
}
