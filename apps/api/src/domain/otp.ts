// Login OTPs (sent by SMS) and trip OTPs (start/end codes per passenger).
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export function generateNumericCode(length: number, rand: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < length; i++) code += String(rand(10));
  return code;
}

export function hashOtp(code: string, phone: string, secret: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---- Login OTP ----

export interface LoginOtpRecord {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type LoginOtpCheck = "OK" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "WRONG_CODE" | "ALREADY_USED";

export function checkLoginOtp(
  record: LoginOtpRecord,
  submittedHash: string,
  now: Date,
  maxAttempts: number,
): LoginOtpCheck {
  if (record.consumedAt) return "ALREADY_USED";
  if (record.attempts >= maxAttempts) return "TOO_MANY_ATTEMPTS";
  if (now.getTime() > record.expiresAt.getTime()) return "EXPIRED";
  return safeEqual(record.codeHash, submittedHash) ? "OK" : "WRONG_CODE";
}

/** Seconds the user must wait before another OTP can be sent (0 = can send now). */
export function resendWaitSeconds(lastSentAt: Date | null, now: Date, resendSeconds: number): number {
  if (!lastSentAt) return 0;
  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(resendSeconds - elapsed));
}

// ---- Trip OTP ----

export interface TripOtpRecord {
  code: string;
  attempts: number;
  usedAt: Date | null;
}

export type TripOtpCheck = "OK" | "ALREADY_USED" | "LOCKED" | "WRONG_CODE";

export function checkTripOtp(record: TripOtpRecord, submitted: string, maxAttempts: number): TripOtpCheck {
  if (record.usedAt) return "ALREADY_USED";
  if (record.attempts >= maxAttempts) return "LOCKED";
  return safeEqual(record.code, submitted.trim()) ? "OK" : "WRONG_CODE";
}

/**
 * Picks `count` distinct 4-digit codes that are not already used on the ride.
 * The database also enforces uniqueness per ride (trip_otps rideId+code).
 */
export function pickUniqueCodes(
  count: number,
  taken: Set<string>,
  rand: (max: number) => number = randomInt,
): string[] {
  if (taken.size + count > 9000) throw new RangeError("Not enough codes left for this ride");
  const out: string[] = [];
  while (out.length < count) {
    const code = String(1000 + rand(9000)); // 1000–9999, no leading zero to avoid confusion
    if (!taken.has(code)) {
      taken.add(code);
      out.push(code);
    }
  }
  return out;
}
