// Trip day: each passenger boards with their START code and gets off with their END code (5.10).
import { prisma } from "../db.js";
import { checkTripOtp } from "../domain/otp.js";
import { badRequest, conflict, notFound, tooMany } from "../errors.js";
import { audit } from "./audit.js";
import { getSettings } from "./settings.js";

async function driverRide(userId: string, rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { driver: true } });
  if (!ride || ride.driver.userId !== userId) throw notFound("Ride");
  return ride;
}

async function ridePassenger(rideId: string, passengerId: string) {
  const p = await prisma.passenger.findUnique({ where: { id: passengerId }, include: { booking: true, tripOtps: true } });
  if (!p || p.booking.rideId !== rideId || !["CONFIRMED", "COMPLETED"].includes(p.booking.status)) throw notFound("Passenger");
  return p;
}

/** Passenger list for the driver's trip screen. Codes are never sent to the driver. */
export async function getDriverRide(userId: string, rideId: string) {
  const ride = await driverRide(userId, rideId);
  const full = await prisma.ride.findUniqueOrThrow({
    where: { id: ride.id },
    include: {
      route: { include: { fromCity: true, toCity: true } },
      vehicle: { include: { vehicleType: true } },
      bookings: { where: { status: { in: ["CONFIRMED", "COMPLETED"] } }, include: { passengers: { orderBy: { createdAt: "asc" } } } },
      fareApprovals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const pointIds = full.bookings.flatMap((b) => [b.pickupPointId, b.dropPointId]).filter((x): x is string => !!x);
  const points = await prisma.pickupPoint.findMany({ where: { id: { in: pointIds } } });
  const pointName = (id: string | null) => points.find((p) => p.id === id)?.name ?? null;

  return {
    id: full.id,
    routeId: full.routeId,
    vehicleId: full.vehicleId,
    notes: full.notes,
    cancelReason: full.cancelReason,
    fareDecision: full.fareApprovals[0] ? { decision: full.fareApprovals[0].decision, reason: full.fareApprovals[0].reason, approvedFare: full.fareApprovals[0].approvedFare } : null,
    from: full.route.fromCity.name,
    to: full.route.toCity.name,
    departureAt: full.departureAt,
    arrivalAt: full.arrivalAt,
    status: full.status,
    seatFare: full.seatFare,
    proposedSeatFare: full.proposedSeatFare,
    totalSeats: full.totalSeats,
    availableSeats: full.availableSeats,
    vehicle: { type: full.vehicle.vehicleType.name, registrationNo: full.vehicle.registrationNo },
    earnings: full.bookings.reduce((n, b) => n + b.driverEarning, 0),
    passengers: full.bookings.flatMap((b) =>
      b.passengers.map((p) => ({
        id: p.id,
        bookingCode: b.code,
        name: p.name,
        phone: p.phone,
        age: p.age,
        gender: p.gender,
        status: p.status,
        pickup: pointName(b.pickupPointId) ?? b.pickupAddress,
        drop: pointName(b.dropPointId) ?? b.dropAddress,
      })),
    ),
  };
}

async function useCode(passenger: Awaited<ReturnType<typeof ridePassenger>>, purpose: "START" | "END", code: string) {
  const otp = passenger.tripOtps.find((t) => t.purpose === purpose);
  if (!otp) throw notFound("Trip code");
  const max = (await getSettings()).tripOtpMaxAttempts;
  const check = checkTripOtp(otp, code, max);
  if (check === "LOCKED") throw tooMany("OTP_LOCKED", "Too many wrong codes. Call PrimeCabs support.");
  if (check === "ALREADY_USED") throw conflict("OTP_USED", "This code was already used");
  if (check === "WRONG_CODE") {
    const updated = await prisma.tripOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const left = Math.max(0, max - updated.attempts);
    throw badRequest("OTP_WRONG", left > 0 ? `Wrong code. ${left} tries left.` : "Wrong code. Call PrimeCabs support.", { attemptsLeft: left });
  }
  const used = await prisma.tripOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) throw conflict("OTP_USED", "This code was already used");
}

export async function boardPassenger(userId: string, rideId: string, passengerId: string, code: string) {
  const ride = await driverRide(userId, rideId);
  if (!["OPEN", "FULL", "STARTED"].includes(ride.status)) throw conflict("RIDE_NOT_ACTIVE", "This ride isn't active");
  const opensMin = (await getSettings()).boardingOpensMinutesBefore;
  if (Date.now() < ride.departureAt.getTime() - opensMin * 60_000) {
    throw conflict("BOARDING_NOT_OPEN", `Boarding opens ${opensMin / 60} hours before departure`);
  }
  const p = await ridePassenger(rideId, passengerId);
  if (p.status !== "BOOKED") throw conflict("ALREADY_BOARDED", "This passenger has already boarded or been marked");
  await useCode(p, "START", code);

  const now = new Date();
  await prisma.passenger.update({ where: { id: p.id }, data: { status: "ONBOARD", boardedAt: now } });
  const started = await prisma.ride.updateMany({ where: { id: rideId, status: { in: ["OPEN", "FULL"] } }, data: { status: "STARTED", startedAt: now } });
  if (started.count) await audit({ actorType: "DRIVER", actorId: userId, action: "ride.started", entity: "ride", entityId: rideId });
  return { passengerId: p.id, status: "ONBOARD" as const };
}

export async function dropPassenger(userId: string, rideId: string, passengerId: string, code: string) {
  await driverRide(userId, rideId);
  const p = await ridePassenger(rideId, passengerId);
  if (p.status !== "ONBOARD") throw conflict("NOT_ONBOARD", "This passenger isn't on board");
  await useCode(p, "END", code);
  await prisma.passenger.update({ where: { id: p.id }, data: { status: "DROPPED", droppedAt: new Date() } });
  const completed = await completeIfDone(rideId, userId);
  return { passengerId: p.id, status: "DROPPED" as const, rideCompleted: completed };
}

export async function markNoShow(userId: string, rideId: string, passengerId: string) {
  const ride = await driverRide(userId, rideId);
  if (Date.now() < ride.departureAt.getTime()) throw conflict("TOO_EARLY", "You can mark a no-show after the departure time");
  const p = await ridePassenger(rideId, passengerId);
  const ok = await prisma.passenger.updateMany({ where: { id: p.id, status: "BOOKED" }, data: { status: "NO_SHOW" } });
  if (ok.count === 0) throw conflict("ALREADY_BOARDED", "This passenger has already boarded or been marked");
  await audit({ actorType: "DRIVER", actorId: userId, action: "passenger.no_show", entity: "passenger", entityId: p.id });
  const completed = await completeIfDone(rideId, userId);
  return { passengerId: p.id, status: "NO_SHOW" as const, rideCompleted: completed };
}

/** Completes the ride once every passenger is dropped or a no-show. */
async function completeIfDone(rideId: string, userId: string): Promise<boolean> {
  const pending = await prisma.passenger.count({
    where: { booking: { rideId, status: "CONFIRMED" }, status: { in: ["BOOKED", "ONBOARD"] } },
  });
  if (pending > 0) return false;
  const ride = await prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
  if (ride.status !== "STARTED" && ride.departureAt.getTime() > Date.now()) return false;
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const r = await tx.ride.updateMany({ where: { id: rideId, status: { in: ["OPEN", "FULL", "STARTED"] } }, data: { status: "COMPLETED", completedAt: now } });
    if (r.count === 0) return false;
    await tx.booking.updateMany({ where: { rideId, status: "CONFIRMED" }, data: { status: "COMPLETED", completedAt: now } });
    return true;
  });
  if (done) await audit({ actorType: "DRIVER", actorId: userId, action: "ride.completed", entity: "ride", entityId: rideId });
  return done;
}

/** Explicit "End trip" button: allowed when nobody is still waiting or on board. */
export async function completeRide(userId: string, rideId: string) {
  const ride = await driverRide(userId, rideId);
  if (Date.now() < ride.departureAt.getTime()) throw conflict("TOO_EARLY", "You can end the trip after the departure time");
  const onboard = await prisma.passenger.count({ where: { booking: { rideId, status: "CONFIRMED" }, status: "ONBOARD" } });
  if (onboard > 0) throw conflict("PASSENGERS_ONBOARD", "Drop every passenger with their end code first");
  const waiting = await prisma.passenger.count({ where: { booking: { rideId, status: "CONFIRMED" }, status: "BOOKED" } });
  if (waiting > 0) throw conflict("PASSENGERS_WAITING", "Board the waiting passengers or mark them as no-show first");
  const done = await completeIfDone(rideId, userId);
  if (!done) throw conflict("RIDE_NOT_ACTIVE", "This ride is already finished or cancelled");
  return { rideId, status: "COMPLETED" as const };
}
