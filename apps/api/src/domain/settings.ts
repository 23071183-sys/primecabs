// Admin-editable business settings. Stored in the `settings` table as one JSON value per key.
// Defaults come from docs/decisions.md; the seed writes them, and admin can change them.
import { z } from "zod";

export const settingSchemas = {
  gst: z.object({
    mode: z.enum(["INCLUDED", "ADDED"]),
    ratePercent: z.number().min(0).max(28),
  }),
  commission: z.object({
    model: z.enum(["FLAT", "BY_PLATE"]),
    percent: z.number().min(0).max(50),
    yellowPercent: z.number().min(0).max(50),
    whitePercent: z.number().min(0).max(50),
  }),
  seatHoldMinutes: z.number().int().min(1).max(30),
  refundTiers: z
    .array(
      z.object({
        minHoursBefore: z.number().min(0),
        percent: z.number().int().min(0).max(100),
      }),
    )
    .min(1)
    .refine((t) => t.some((x) => x.minHoursBefore === 0), "Add a tier starting at 0 hours"),
  bookingHorizonDays: z.number().int().min(1).max(365),
  bookingCutoffMinutes: z.number().int().min(0).max(24 * 60),
  boardingOpensMinutesBefore: z.number().int().min(0).max(24 * 60),
  loginOtp: z.object({
    length: z.number().int().min(4).max(8),
    ttlSeconds: z.number().int().min(60).max(900),
    maxAttempts: z.number().int().min(1).max(10),
    resendSeconds: z.number().int().min(10).max(300),
    maxPerHour: z.number().int().min(1).max(20),
  }),
  tripOtpMaxAttempts: z.number().int().min(1).max(10),
  support: z.object({
    phone: z.string(),
    email: z.string(),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

export const defaultSettings: Settings = {
  gst: { mode: "INCLUDED", ratePercent: 5 },
  commission: { model: "BY_PLATE", percent: 10, yellowPercent: 10, whitePercent: 15 },
  seatHoldMinutes: 5,
  refundTiers: [
    { minHoursBefore: 24, percent: 100 },
    { minHoursBefore: 12, percent: 75 },
    { minHoursBefore: 4, percent: 50 },
    { minHoursBefore: 0, percent: 0 },
  ],
  bookingHorizonDays: 30,
  bookingCutoffMinutes: 15,
  boardingOpensMinutesBefore: 120,
  loginOtp: { length: 6, ttlSeconds: 300, maxAttempts: 5, resendSeconds: 30, maxPerHour: 5 },
  tripOtpMaxAttempts: 5,
  support: { phone: "+91 00000 00000", email: "support@primecabs.example" },
};

export const settingKeys = Object.keys(settingSchemas) as SettingKey[];
