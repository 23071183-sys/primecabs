import type { ReactNode } from "react";
import type { BookingStatus, DriverStatus, ReviewStatus, RideStatus } from "@/lib/types";

export type Tone = "green" | "amber" | "red" | "blue" | "gray" | "navy";

const tones: Record<Tone, string> = {
  green: "bg-success-bg text-success",
  amber: "bg-warning-bg text-warning",
  red: "bg-danger-bg text-danger",
  blue: "bg-info-bg text-info",
  gray: "bg-muted text-ink-2",
  navy: "bg-info-bg text-brand-ink",
};

export function Badge({ tone = "gray", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const statusMap: Record<string, [Tone, string]> = {
  // drivers
  DRAFT: ["gray", "Draft"],
  PENDING: ["amber", "Pending review"],
  APPROVED: ["green", "Approved"],
  REJECTED: ["red", "Rejected"],
  SUSPENDED: ["red", "Suspended"],
  // rides
  PENDING_APPROVAL: ["amber", "Fare in review"],
  OPEN: ["green", "Live"],
  FULL: ["navy", "Full"],
  STARTED: ["blue", "On trip"],
  COMPLETED: ["gray", "Completed"],
  CANCELLED: ["red", "Cancelled"],
  // bookings
  HELD: ["amber", "Awaiting payment"],
  CONFIRMED: ["green", "Confirmed"],
  EXPIRED: ["gray", "Expired"],
  // payments and refunds
  CREATED: ["gray", "Created"],
  PAID: ["green", "Paid"],
  FAILED: ["red", "Failed"],
  PROCESSED: ["green", "Refunded"],
  // passengers
  BOOKED: ["gray", "Waiting"],
  ONBOARD: ["blue", "On board"],
  DROPPED: ["green", "Dropped"],
  NO_SHOW: ["red", "No-show"],
};

export function StatusBadge({ status }: { status: DriverStatus | RideStatus | BookingStatus | ReviewStatus | string }) {
  const [tone, label] = statusMap[status] ?? ["gray", status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
