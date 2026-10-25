import { describe, expect, it } from "vitest";
import { gstIncludedIn, priceBooking } from "../../src/domain/fare.js";
import { formatInr, rupees } from "../../src/domain/money.js";
import { defaultSettings } from "../../src/domain/settings.js";

const base = {
  gst: defaultSettings.gst,
  commission: defaultSettings.commission,
  pickupExtra: 0,
  dropExtra: 0,
};

describe("priceBooking: GST included (default)", () => {
  it("splits GST out of the price and takes commission before GST (plan example)", () => {
    const p = priceBooking({ ...base, seatFare: rupees(500), seats: 2, pickupExtra: rupees(100), plateType: "YELLOW" });
    expect(p.seatsAmount).toBe(100_000);
    expect(p.total).toBe(110_000); // ₹1,100: customer pays exactly the listed price
    expect(p.gstAmount).toBe(5_238); // ₹52.38 = 1100 × 5/105
    expect(p.netAmount).toBe(104_762); // ₹1,047.62
    expect(p.commissionRateBp).toBe(1000); // yellow plate 10%
    expect(p.commissionAmount).toBe(10_476); // ₹104.76
    expect(p.driverEarning).toBe(94_286);
    expect(p.netAmount + p.gstAmount).toBe(p.total);
    expect(p.commissionAmount + p.driverEarning).toBe(p.netAmount);
  });

  it("uses the white-plate rate for white-plate vehicles", () => {
    const p = priceBooking({ ...base, seatFare: rupees(550), seats: 1, plateType: "WHITE" });
    expect(p.total).toBe(55_000);
    expect(p.gstAmount).toBe(2_619); // 550 × 5/105 = 26.19
    expect(p.commissionRateBp).toBe(1500);
    expect(p.commissionAmount).toBe(7_857); // 15% of 523.81
    expect(p.driverEarning).toBe(55_000 - 2_619 - 7_857);
  });

  it("applies the flat model to every plate", () => {
    const commission = { ...defaultSettings.commission, model: "FLAT" as const, percent: 8 };
    const y = priceBooking({ ...base, commission, seatFare: rupees(500), seats: 1, plateType: "YELLOW" });
    const w = priceBooking({ ...base, commission, seatFare: rupees(500), seats: 1, plateType: "WHITE" });
    expect(y.commissionRateBp).toBe(800);
    expect(w.commissionAmount).toBe(y.commissionAmount);
  });
});

describe("priceBooking: GST added on top", () => {
  it("adds GST to the fare", () => {
    const gst = { mode: "ADDED" as const, ratePercent: 5 };
    const p = priceBooking({ ...base, gst, seatFare: rupees(500), seats: 1, plateType: "YELLOW" });
    expect(p.gstAmount).toBe(2_500);
    expect(p.total).toBe(52_500);
    expect(p.netAmount).toBe(50_000);
    expect(p.commissionAmount).toBe(5_000);
  });

  it("handles a 0% GST rate", () => {
    const p = priceBooking({ ...base, gst: { mode: "ADDED", ratePercent: 0 }, seatFare: 12_345, seats: 3, plateType: "WHITE" });
    expect(p.gstAmount).toBe(0);
    expect(p.total).toBe(37_035);
  });
});

describe("priceBooking: input checks", () => {
  it("rejects zero or fractional seats and non-positive fares", () => {
    expect(() => priceBooking({ ...base, seatFare: 50_000, seats: 0, plateType: "YELLOW" })).toThrow();
    expect(() => priceBooking({ ...base, seatFare: 50_000, seats: 1.5, plateType: "YELLOW" })).toThrow();
    expect(() => priceBooking({ ...base, seatFare: 0, seats: 1, plateType: "YELLOW" })).toThrow();
    expect(() => priceBooking({ ...base, seatFare: 50_000, seats: 1, pickupExtra: -1, plateType: "YELLOW" })).toThrow();
  });

  it("never produces fractional paise", () => {
    for (let fare = 10_001; fare < 10_200; fare += 7) {
      const p = priceBooking({ ...base, seatFare: fare, seats: 3, plateType: "WHITE" });
      for (const v of [p.total, p.gstAmount, p.netAmount, p.commissionAmount, p.driverEarning]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});

describe("helpers", () => {
  it("gstIncludedIn and formatInr", () => {
    expect(gstIncludedIn(105_000, 500)).toBe(5_000);
    expect(formatInr(110_000)).toBe("₹1,100");
    expect(formatInr(5_238)).toBe("₹52.38");
    expect(formatInr(1_00_00_000)).toBe("₹1,00,000");
  });
});
