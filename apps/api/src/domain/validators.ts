// Input rules shared by every route. Server-side validation is the source of truth.
import { z } from "zod";

/** Accepts 9876543210, 09876543210, +919876543210, "98765 43210"; returns +919876543210. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  const m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}

export const indianMobile = z
  .string()
  .transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return n;
  });

/** Indian registration numbers like MH31AB1234, MH 31 AB 1234, DL1CAB1234, 22BH1234AB (BH series). */
export function normalizeVehicleReg(input: string): string | null {
  const v = input.toUpperCase().replace(/[\s-]/g, "");
  if (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(v)) return v;
  if (/^\d{2}BH\d{4}[A-Z]{1,2}$/.test(v)) return v;
  return null;
}

export const vehicleReg = z.string().transform((v, ctx) => {
  const n = normalizeVehicleReg(v);
  if (!n) {
    ctx.addIssue({ code: "custom", message: "Enter a valid vehicle number, for example MH31AB1234" });
    return z.NEVER;
  }
  return n;
});

export const personName = z
  .string()
  .trim()
  .min(2, "Name is too short")
  .max(60, "Name is too long")
  .regex(/^[\p{L}][\p{L} .'-]*$/u, "Use letters, spaces, dots, apostrophes or hyphens only");

export const gender = z.enum(["MALE", "FEMALE", "OTHER"]);
export const age = z.number().int().min(1).max(120);
export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(120);
export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const rupeesToPaise = z.number().int().positive().max(10_000_000); // paise; ₹1,00,000 max

export const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code");
export const bankAccountNo = z.string().trim().regex(/^\d{9,18}$/, "Account number must be 9 to 18 digits");
export const upiId = z.string().trim().regex(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, "Enter a valid UPI ID");
