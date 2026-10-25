import { describe, expect, it } from "vitest";
import { dateTime, duration, inr, isoToIst, istDateString, istToIso, paiseFromInput, phone, relativeDay, time } from "@primecabs/mobile-ui";
import { departureFrom, hourLabel, nextDays, parseExpiry } from "@/lib/schedule";

// 25 Oct 2026, 11:00 PM IST
const now = new Date("2026-10-25T17:30:00Z");

describe("IST dates for publishing", () => {
  it("lists days starting today in IST, even late at night UTC", () => {
    const days = nextDays(3, now);
    expect(days.map((d) => d.date)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(days[0]!.weekday).toBe("Today");
    expect(days[1]!.weekday).toBe("Tmrw");
    expect(days[2]).toMatchObject({ weekday: "Tue", day: 27, month: "Oct" });
  });

  it("turns an IST date and time into the right instant", () => {
    expect(istToIso("2026-11-01", "07:30")).toBe("2026-11-01T02:00:00.000Z");
    expect(isoToIst("2026-11-01T02:00:00.000Z")).toEqual({ date: "2026-11-01", time: "07:30" });
    expect(istDateString(0, new Date("2026-10-31T19:00:00Z"))).toBe("2026-11-01"); // 00:30 IST
  });

  it("rejects departures too soon and accepts later ones", () => {
    expect(departureFrom("2026-10-25", 23, "00", now, 15)).toEqual({ error: "Choose a time at least 15 minutes from now" });
    expect(departureFrom("2026-10-25", 23, "15", now, 15)).toEqual({ iso: "2026-10-25T17:45:00.000Z" }); // exactly the cutoff is allowed
    expect(departureFrom("2026-10-25", 23, "45", now, 15)).toEqual({ iso: "2026-10-25T18:15:00.000Z" });
    expect(departureFrom("2026-10-26", null, null, now, 15)).toEqual({ error: "Choose a departure time" });
  });

  it("labels hours in 12-hour time", () => {
    expect([hourLabel(4), hourLabel(12), hourLabel(13), hourLabel(23)]).toEqual(["4 AM", "12 PM", "1 PM", "11 PM"]);
  });
});

describe("document expiry dates", () => {
  it("accepts DD/MM/YYYY in the future", () => {
    expect(parseExpiry("25/10/2027", now)).toBe("2027-10-25");
    expect(parseExpiry("1-2-2030", now)).toBe("2030-02-01");
  });
  it("rejects impossible or past dates", () => {
    expect(parseExpiry("31/02/2030", now)).toBeNull();
    expect(parseExpiry("01/01/2020", now)).toBeNull();
    expect(parseExpiry("2030-01-01", now)).toBeNull();
  });
});

describe("display formatting", () => {
  it("formats rupees with Indian grouping", () => {
    expect(inr(55_000)).toBe("₹550");
    expect(inr(5_238)).toBe("₹52.38");
    expect(inr(1_00_00_000)).toBe("₹1,00,000");
    expect(inr(12_34_56_700)).toBe("₹12,34,567");
    expect(inr(null)).toBe("—");
  });
  it("reads typed fares", () => {
    expect(paiseFromInput("550")).toBe(55_000);
    expect(paiseFromInput("52.5")).toBe(5_250);
    expect(paiseFromInput("5.555")).toBeNull();
  });
  it("shows IST times and friendly days", () => {
    expect(time("2026-11-01T02:00:00Z")).toBe("7:30 AM");
    expect(time("2026-11-01T11:45:00Z")).toBe("5:15 PM");
    expect(relativeDay("2026-10-26T02:00:00Z", now)).toBe("Tomorrow");
    expect(dateTime("2026-10-25T17:45:00Z", now)).toBe("Today, 11:15 PM");
    expect(duration(165)).toBe("2h 45m");
    expect(phone("+919876543210")).toBe("+91 98765 43210");
  });
});
