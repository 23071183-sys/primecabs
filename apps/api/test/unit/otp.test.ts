import { describe, expect, it } from "vitest";
import {
  checkLoginOtp,
  checkTripOtp,
  generateNumericCode,
  hashOtp,
  pickUniqueCodes,
  resendWaitSeconds,
} from "../../src/domain/otp.js";

const secret = "test-secret";
const phone = "+919876543210";
const now = new Date("2026-11-01T00:00:00Z");

const record = (over: Partial<Parameters<typeof checkLoginOtp>[0]> = {}) => ({
  codeHash: hashOtp("123456", phone, secret),
  expiresAt: new Date(now.getTime() + 300_000),
  attempts: 0,
  consumedAt: null,
  ...over,
});

describe("login OTP", () => {
  it("generates codes of the requested length, digits only", () => {
    for (let i = 0; i < 50; i++) expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
  });

  it("accepts the right code before expiry", () => {
    expect(checkLoginOtp(record(), hashOtp("123456", phone, secret), now, 5)).toBe("OK");
  });

  it("rejects a wrong code", () => {
    expect(checkLoginOtp(record(), hashOtp("654321", phone, secret), now, 5)).toBe("WRONG_CODE");
  });

  it("ties the hash to the phone number", () => {
    expect(checkLoginOtp(record(), hashOtp("123456", "+919999999999", secret), now, 5)).toBe("WRONG_CODE");
  });

  it("expires after 5 minutes", () => {
    const later = new Date(now.getTime() + 300_001);
    expect(checkLoginOtp(record(), hashOtp("123456", phone, secret), later, 5)).toBe("EXPIRED");
  });

  it("locks after 5 attempts, even with the right code", () => {
    expect(checkLoginOtp(record({ attempts: 5 }), hashOtp("123456", phone, secret), now, 5)).toBe("TOO_MANY_ATTEMPTS");
  });

  it("cannot be reused", () => {
    expect(checkLoginOtp(record({ consumedAt: now }), hashOtp("123456", phone, secret), now, 5)).toBe("ALREADY_USED");
  });

  it("enforces the 30-second resend wait", () => {
    expect(resendWaitSeconds(null, now, 30)).toBe(0);
    expect(resendWaitSeconds(new Date(now.getTime() - 10_000), now, 30)).toBe(20);
    expect(resendWaitSeconds(new Date(now.getTime() - 30_000), now, 30)).toBe(0);
  });
});

describe("trip OTP", () => {
  const rec = { code: "4821", attempts: 0, usedAt: null };

  it("accepts the right code (spaces trimmed)", () => {
    expect(checkTripOtp(rec, "4821", 5)).toBe("OK");
    expect(checkTripOtp(rec, " 4821 ", 5)).toBe("OK");
  });

  it("rejects a wrong code", () => {
    expect(checkTripOtp(rec, "4822", 5)).toBe("WRONG_CODE");
    expect(checkTripOtp(rec, "482", 5)).toBe("WRONG_CODE");
  });

  it("cannot be used twice", () => {
    expect(checkTripOtp({ ...rec, usedAt: now }, "4821", 5)).toBe("ALREADY_USED");
  });

  it("locks after too many wrong tries", () => {
    expect(checkTripOtp({ ...rec, attempts: 5 }, "4821", 5)).toBe("LOCKED");
  });

  it("picks codes unique within a ride, never starting with 0", () => {
    const taken = new Set(["1000", "1001"]);
    let n = 0;
    const rand = () => [0, 1, 0, 2, 3][n++ % 5]!; // forces repeats of taken codes
    const codes = pickUniqueCodes(2, taken, rand);
    expect(codes).toEqual(["1002", "1003"]);
    const many = pickUniqueCodes(100, new Set());
    expect(new Set(many).size).toBe(100);
    for (const c of many) expect(c).toMatch(/^[1-9]\d{3}$/);
  });
});
