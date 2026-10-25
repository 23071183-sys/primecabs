// Booking rules that don't need the database: codes, hold expiry, booking window.
import { addMinutes, istYYMMDD } from "./time.js";

export const BOOKING_SEQ_START = 1001;

/** PC-YYMMDD-NNNN (IST date). Sequence starts at 1001 each day. */
export function formatBookingCode(createdAt: Date, seq: number): string {
  return `PC-${istYYMMDD(createdAt)}-${String(seq).padStart(4, "0")}`;
}

export function holdExpiresAt(now: Date, holdMinutes: number): Date {
  return addMinutes(now, holdMinutes);
}

export function isHoldExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export type BookableCheck = "OK" | "DEPARTED" | "CLOSED" | "TOO_FAR_AHEAD";

/** Can a customer still book a ride departing at `departureAt`? */
export function checkBookable(departureAt: Date, now: Date, cutoffMinutes: number, horizonDays: number): BookableCheck {
  if (departureAt.getTime() <= now.getTime()) return "DEPARTED";
  if (departureAt.getTime() - now.getTime() < cutoffMinutes * 60_000) return "CLOSED";
  if (departureAt.getTime() - now.getTime() > horizonDays * 86_400_000) return "TOO_FAR_AHEAD";
  return "OK";
}

/** Do two time ranges overlap? Ranges touching end-to-start do not overlap. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
