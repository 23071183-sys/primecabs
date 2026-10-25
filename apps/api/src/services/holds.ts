// Seat reservation. Every change to a ride's seat count goes through these two SQL statements,
// so two customers can never get the same seat: Postgres locks the ride row for the UPDATE and
// re-checks `availableSeats >= n` before applying it.
import { prisma, type Tx } from "../db.js";

/** Takes `seats` seats from an OPEN ride. Returns false if they are not available. */
export async function reserveSeats(tx: Tx, rideId: string, seats: number): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "rides"
    SET "availableSeats" = "availableSeats" - ${seats},
        "status" = CASE WHEN "availableSeats" - ${seats} = 0 THEN 'FULL'::"RideStatus" ELSE "status" END,
        "updatedAt" = now()
    WHERE "id" = ${rideId} AND "status" = 'OPEN' AND "availableSeats" >= ${seats}`;
  return updated === 1;
}

/** Gives seats back to a ride (never above its total). A FULL ride becomes OPEN again. */
export async function returnSeats(tx: Tx, rideId: string, seats: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "rides"
    SET "availableSeats" = LEAST("totalSeats", "availableSeats" + ${seats}),
        "status" = CASE WHEN "status" = 'FULL' THEN 'OPEN'::"RideStatus" ELSE "status" END,
        "updatedAt" = now()
    WHERE "id" = ${rideId}`;
}

/** Locks a booking row for the rest of the transaction, so confirm/cancel/expire run one at a time. */
export async function lockBooking(tx: Tx, bookingId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
}

export async function lockRide(tx: Tx, rideId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "rides" WHERE "id" = ${rideId} FOR UPDATE`;
}

/**
 * Releases an unpaid (HELD) booking and returns its seats.
 * Returns false if the booking was no longer HELD (already paid, expired or cancelled).
 */
export async function releaseHeldBooking(
  bookingId: string,
  outcome: "EXPIRED" | "CANCELLED",
  cancelledBy?: "CUSTOMER" | "DRIVER" | "ADMIN" | "SYSTEM",
  reason?: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const now = new Date();
    const changed = await tx.booking.updateMany({
      where: { id: bookingId, status: "HELD" },
      data:
        outcome === "EXPIRED"
          ? { status: "EXPIRED" }
          : { status: "CANCELLED", cancelledAt: now, cancelledBy: cancelledBy ?? "CUSTOMER", cancelReason: reason ?? null },
    });
    if (changed.count === 0) return false;
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { rideId: true, seats: true } });
    await returnSeats(tx, booking.rideId, booking.seats);
    await tx.seatHold.updateMany({ where: { bookingId, status: "ACTIVE" }, data: { status: "RELEASED" } });
    return true;
  });
}

/** Expires holds whose time is up. Runs every minute and also before searches and bookings. */
export async function expireStaleHolds(now = new Date(), rideId?: string): Promise<number> {
  const stale = await prisma.booking.findMany({
    where: { status: "HELD", holdExpiresAt: { lte: now }, ...(rideId ? { rideId } : {}) },
    select: { id: true },
    take: 500,
  });
  let released = 0;
  for (const { id } of stale) if (await releaseHeldBooking(id, "EXPIRED")) released++;
  return released;
}
