import { describe, expect, it } from "vitest";
import { checkBookable, formatBookingCode, holdExpiresAt, isHoldExpired, rangesOverlap } from "../../src/domain/booking.js";
import { istDayRange } from "../../src/domain/time.js";
import { normalizeIndianMobile, normalizeVehicleReg } from "../../src/domain/validators.js";
import { defaultSettings, settingSchemas } from "../../src/domain/settings.js";

const now = new Date("2026-11-01T00:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);

describe("seat hold", () => {
  it("expires after the configured minutes (default 5)", () => {
    const exp = holdExpiresAt(now, defaultSettings.seatHoldMinutes);
    expect(exp.toISOString()).toBe("2026-11-01T00:05:00.000Z");
    expect(isHoldExpired(exp, min(4.99))).toBe(false);
    expect(isHoldExpired(exp, min(5))).toBe(true);
  });
});

describe("booking window", () => {
  it("closes 15 minutes before departure and opens 30 days ahead", () => {
    expect(checkBookable(min(60), now, 15, 30)).toBe("OK");
    expect(checkBookable(min(15), now, 15, 30)).toBe("OK");
    expect(checkBookable(min(14), now, 15, 30)).toBe("CLOSED");
    expect(checkBookable(min(-1), now, 15, 30)).toBe("DEPARTED");
    expect(checkBookable(min(31 * 24 * 60), now, 15, 30)).toBe("TOO_FAR_AHEAD");
  });
});

describe("booking code", () => {
  it("uses the IST date", () => {
    // 20:00 UTC on 31 Oct is 01:30 IST on 1 Nov
    expect(formatBookingCode(new Date("2026-10-31T20:00:00Z"), 1001)).toBe("PC-261101-1001");
    expect(formatBookingCode(new Date("2026-10-31T18:00:00Z"), 1002)).toBe("PC-261031-1002");
  });
});

describe("IST day range", () => {
  it("covers midnight to midnight IST", () => {
    const { start, end } = istDayRange("2026-11-01");
    expect(start.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T18:30:00.000Z");
  });
  it("rejects impossible dates", () => {
    expect(() => istDayRange("2026-02-30")).toThrow();
    expect(() => istDayRange("1/11/2026")).toThrow();
  });
});

describe("ride overlap", () => {
  it("detects overlap and allows back-to-back trips", () => {
    expect(rangesOverlap(min(0), min(120), min(60), min(180))).toBe(true);
    expect(rangesOverlap(min(0), min(120), min(120), min(240))).toBe(false);
  });
});

describe("validators", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("+919876543210");
    expect(normalizeIndianMobile("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeIndianMobile("09876543210")).toBe("+919876543210");
    expect(normalizeIndianMobile("5876543210")).toBeNull();
    expect(normalizeIndianMobile("987654321")).toBeNull();
  });
  it("normalises vehicle numbers", () => {
    expect(normalizeVehicleReg("mh 31 ab 1234")).toBe("MH31AB1234");
    expect(normalizeVehicleReg("22BH1234AA")).toBe("22BH1234AA");
    expect(normalizeVehicleReg("MH31AB12")).toBeNull();
  });
});

describe("settings defaults", () => {
  it("pass their own validation", () => {
    for (const [key, schema] of Object.entries(settingSchemas)) {
      expect(schema.safeParse(defaultSettings[key as keyof typeof defaultSettings]).success, key).toBe(true);
    }
  });
  it("refund tiers must include a 0-hour tier", () => {
    expect(settingSchemas.refundTiers.safeParse([{ minHoursBefore: 24, percent: 100 }]).success).toBe(false);
  });
});
