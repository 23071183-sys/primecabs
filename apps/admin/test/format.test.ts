import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtPhone, fromNow, inrFromPaise, paiseFromRupees } from "@/lib/format";
import { fareDiff } from "@/pages/RidesPage";

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(inrFromPaise(110_000)).toBe("₹1,100");
    expect(inrFromPaise(5_238)).toBe("₹52.38");
    expect(inrFromPaise(1_00_00_000)).toBe("₹1,00,000");
    expect(inrFromPaise(null)).toBe("—");
  });

  it("reads rupees typed by an admin", () => {
    expect(paiseFromRupees("550")).toBe(55_000);
    expect(paiseFromRupees("₹1,200.50")).toBe(120_050);
    expect(paiseFromRupees("52.5")).toBe(5_250);
    expect(paiseFromRupees("abc")).toBeNull();
    expect(paiseFromRupees("-5")).toBeNull();
    expect(paiseFromRupees("1.234")).toBeNull();
  });
});

describe("dates and phones", () => {
  it("shows times in IST", () => {
    expect(fmtDateTime("2026-11-01T02:00:00Z")).toMatch(/1 Nov.*7:30\s?am/i);
  });
  it("says how far away a time is", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    expect(fromNow("2026-11-01T03:00:00Z", now)).toBe("in 3 h");
    expect(fromNow("2026-10-31T23:35:00Z", now)).toBe("25 min ago");
  });
  it("formats Indian mobile numbers", () => {
    expect(fmtPhone("+919876543210")).toBe("+91 98765 43210");
  });
});

describe("fare comparison", () => {
  it("compares a proposed fare with the route reference", () => {
    expect(fareDiff(55_000, 50_000)).toEqual({ label: "10% above reference", tone: "amber" });
    expect(fareDiff(45_000, 50_000)).toEqual({ label: "10% below reference", tone: "green" });
    expect(fareDiff(50_000, 50_000)?.label).toBe("matches reference");
    expect(fareDiff(50_000, null)).toBeNull();
  });
});
