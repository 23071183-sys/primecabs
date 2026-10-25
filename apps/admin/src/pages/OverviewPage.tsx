import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardCheck, IdCard, IndianRupee, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from "@/components/ui/Data";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fromNow, inrFromPaise } from "@/lib/format";
import type { Overview } from "@/lib/types";

/** A number on the navy header, styled like the driver app's earnings cards. */
function Stat({ label, value, icon, to, attention }: { label: string; value: ReactNode; icon: ReactNode; to?: string; attention?: boolean }) {
  const body = (
    <div className={`flex h-full items-start justify-between rounded-xl bg-white/10 p-4 ring-1 ring-inset transition-colors ${attention ? "ring-teal-400/70" : "ring-white/15"} ${to ? "hover:bg-white/15" : ""}`}>
      <div>
        <p className="text-[13px] text-white/75">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular text-white">{value}</p>
      </div>
      <div className={`flex size-8 items-center justify-center rounded-lg ${attention ? "bg-teal-500 text-teal-900" : "bg-white/10 text-teal-400"}`}>{icon}</div>
    </div>
  );
  return to ? (
    <Link to={to} className="rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** The app's seat bar: one segment per seat, teal when sold. */
function SeatBar({ sold, total }: { sold: number; total: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i < sold ? "bg-teal-500" : "bg-line"}`} />
      ))}
    </div>
  );
}

export function OverviewPage() {
  const { admin, can } = useAuth();
  const q = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/admin/overview"), refetchInterval: 60_000 });
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      {/* Navy header with the day's numbers, like the driver app's Home screen. Edge to edge on phones. */}
      <section className="-mx-4 -mt-6 mb-6 bg-navy-700 px-4 pt-5 pb-5 text-white sm:mx-0 sm:mt-0 sm:rounded-card sm:px-6 sm:pt-6">
        <p className="text-sm text-white/75">{greeting},</p>
        <h1 className="text-2xl font-bold tracking-tight">{admin?.name.split(" ")[0] ?? ""}</h1>
        <p className="mt-0.5 text-sm text-white/60">Here's what needs you today.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {q.data ? (
            <>
              <Stat
                label="Drivers to approve"
                value={q.data.driversPending}
                icon={<IdCard className="size-4" />}
                to={can("drivers.read") ? "/drivers?status=PENDING" : undefined}
                attention={q.data.driversPending > 0}
              />
              <Stat
                label="Fares to review"
                value={q.data.ridesPending}
                icon={<ClipboardCheck className="size-4" />}
                to={can("rides.read") ? "/rides" : undefined}
                attention={q.data.ridesPending > 0}
              />
              <Stat label="Bookings, 24 h" value={q.data.bookingsLast24h} icon={<Ticket className="size-4" />} to={can("bookings.read") ? "/bookings" : undefined} />
              <Stat label="Collected, 24 h" value={inrFromPaise(q.data.revenueLast24h)} icon={<IndianRupee className="size-4" />} />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[84px] animate-pulse rounded-xl bg-white/10" aria-hidden />)
          )}
        </div>
      </section>

      {q.isError ? (
        <Card>
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          {q.data && (q.data.refundsFailed > 0 || q.data.emptyRidesNext6h > 0) && (
            <div className="mb-6 space-y-2">
              {q.data.refundsFailed > 0 && (
                <Link to="/money" className="flex items-center gap-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger hover:opacity-90">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span className="flex-1">
                    {q.data.refundsFailed} refund{q.data.refundsFailed > 1 ? "s" : ""} failed at the payment gateway and need a retry.
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              )}
              {q.data.emptyRidesNext6h > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
                  <CalendarClock className="size-4 shrink-0" />
                  {q.data.emptyRidesNext6h} ride{q.data.emptyRidesNext6h > 1 ? "s" : ""} leave in the next 6 hours with no bookings yet.
                </div>
              )}
            </div>
          )}

          <Card padded={false}>
            <div className="px-5 pt-5">
              <CardTitle action={can("rides.read") && <Link to="/rides?status=OPEN" className="text-[13px] font-semibold text-accent hover:underline">All live rides</Link>}>
                Departures in the next 48 hours
              </CardTitle>
            </div>
            {!q.data ? (
              <div className="space-y-3 px-5 pb-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : q.data.upcomingRides.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-5" />} title="No departures coming up" body="Approved rides leaving in the next two days will show here." />
            ) : (
              <ul className="divide-y divide-line">
                {q.data.upcomingRides.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
                    <div className="w-36">
                      <div className="text-sm font-semibold tabular text-ink">{fmtDateTime(r.departureAt)}</div>
                      <div className="text-xs text-ink-2">{fromNow(r.departureAt)}</div>
                    </div>
                    <div className="min-w-40 flex-1">
                      <div className="text-sm font-semibold text-ink">
                        {r.from} → {r.to}
                      </div>
                      <div className="text-xs text-ink-2">
                        {r.driver} · {r.vehicleType}
                      </div>
                    </div>
                    <div className="w-40">
                      <div className="mb-1.5 text-xs text-ink-2">
                        {r.seatsSold} of {r.totalSeats} booked
                      </div>
                      <SeatBar sold={r.seatsSold} total={r.totalSeats} />
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
