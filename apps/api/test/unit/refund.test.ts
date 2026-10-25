import { describe, expect, it } from "vitest";
import { computeRefund } from "../../src/domain/refund.js";
import { defaultSettings } from "../../src/domain/settings.js";

const departureAt = new Date("2026-11-01T02:00:00Z"); // 7:30 AM IST
const hoursBefore = (h: number) => new Date(departureAt.getTime() - h * 3_600_000);
const tiers = defaultSettings.refundTiers;
const paid = 110_000; // ₹1,100

const refundAt = (h: number, cancelledBy: "CUSTOMER" | "DRIVER" | "ADMIN" = "CUSTOMER") =>
  computeRefund({ amountPaid: paid, departureAt, now: hoursBefore(h), tiers, cancelledBy });

describe("computeRefund tiers (lower bound inclusive)", () => {
  it.each([
    [48, 100, 110_000],
    [24, 100, 110_000], // exactly 24 h -> 100%
    [23.99, 75, 82_500],
    [12, 75, 82_500], // exactly 12 h -> 75%
    [11.99, 50, 55_000],
    [4, 50, 55_000], // exactly 4 h -> 50%
    [3.99, 0, 0],
    [0.01, 0, 0],
  ])("%s hours before departure -> %s%%", (h, percent, amount) => {
    const r = refundAt(h);
    expect(r.percent).toBe(percent);
    expect(r.amount).toBe(amount);
  });

  it("rounds partial refunds down to a whole rupee", () => {
    const r = computeRefund({ amountPaid: 52_538, departureAt, now: hoursBefore(13), tiers, cancelledBy: "CUSTOMER" });
    expect(r.amount).toBe(39_400); // 75% of ₹525.38 = ₹394.03 -> ₹394
  });

  it("refunds the exact amount (paise included) at 100%", () => {
    const r = computeRefund({ amountPaid: 52_538, departureAt, now: hoursBefore(30), tiers, cancelledBy: "CUSTOMER" });
    expect(r.amount).toBe(52_538);
  });

  it("gives nothing after departure", () => {
    expect(refundAt(-1).amount).toBe(0);
  });

  it("labels each tier", () => {
    expect(refundAt(30).tierLabel).toBe("24+ hours before: 100%");
    expect(refundAt(13).tierLabel).toBe("12–24 hours before: 75%");
    expect(refundAt(1).tierLabel).toBe("Under 4 hours: 0%");
  });
});

describe("computeRefund by driver or admin", () => {
  it("always refunds 100%, even close to departure", () => {
    expect(refundAt(1, "DRIVER")).toMatchObject({ percent: 100, amount: paid });
    expect(refundAt(0.5, "ADMIN")).toMatchObject({ percent: 100, amount: paid });
  });
});

describe("computeRefund with edited tiers", () => {
  it("follows admin-changed tiers, in any order", () => {
    const custom = [
      { minHoursBefore: 0, percent: 10 },
      { minHoursBefore: 6, percent: 90 },
    ];
    expect(computeRefund({ amountPaid: 10_000, departureAt, now: hoursBefore(6), tiers: custom, cancelledBy: "CUSTOMER" }).percent).toBe(90);
    expect(computeRefund({ amountPaid: 10_000, departureAt, now: hoursBefore(5), tiers: custom, cancelledBy: "CUSTOMER" }).amount).toBe(1_000);
  });
});
