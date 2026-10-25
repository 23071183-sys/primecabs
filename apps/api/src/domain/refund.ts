// Refund amount on cancellation, from the admin-editable tiers.
// A tier applies when hours before departure >= its minHoursBefore (lower bound inclusive).
import { floorToRupee } from "./money.js";
import type { Settings } from "./settings.js";

export type CancelledBy = "CUSTOMER" | "DRIVER" | "ADMIN" | "SYSTEM";

export interface RefundResult {
  hoursBefore: number;
  percent: number;
  amount: number; // paise
  tierLabel: string;
}

const HOUR_MS = 3_600_000;

export function tierLabel(tiers: Settings["refundTiers"], index: number): string {
  const sorted = [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  const t = sorted[index]!;
  const upper = index === 0 ? null : sorted[index - 1]!.minHoursBefore;
  if (upper === null) return `${t.minHoursBefore}+ hours before: ${t.percent}%`;
  if (t.minHoursBefore === 0) return `Under ${upper} hours: ${t.percent}%`;
  return `${t.minHoursBefore}–${upper} hours before: ${t.percent}%`;
}

export function computeRefund(args: {
  amountPaid: number;
  departureAt: Date;
  now: Date;
  tiers: Settings["refundTiers"];
  cancelledBy: CancelledBy;
}): RefundResult {
  const hoursBefore = (args.departureAt.getTime() - args.now.getTime()) / HOUR_MS;

  // The driver or PrimeCabs cancelling always refunds in full (7.5).
  if (args.cancelledBy !== "CUSTOMER") {
    return { hoursBefore, percent: 100, amount: args.amountPaid, tierLabel: "Cancelled by PrimeCabs or driver: 100%" };
  }
  if (hoursBefore < 0) {
    return { hoursBefore, percent: 0, amount: 0, tierLabel: "After departure: 0%" };
  }

  const sorted = [...args.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  const index = sorted.findIndex((t) => hoursBefore >= t.minHoursBefore);
  if (index === -1) return { hoursBefore, percent: 0, amount: 0, tierLabel: "No refund tier: 0%" };
  const percent = sorted[index]!.percent;

  const amount = percent >= 100 ? args.amountPaid : floorToRupee((args.amountPaid * percent) / 100);
  return { hoursBefore, percent, amount, tierLabel: tierLabel(args.tiers, index) };
}
