import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardCheck, IdCard, IndianRupee, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardTitle, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/Data";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fromNow, inrFromPaise } from "@/lib/format";
import type { Overview } from "@/lib/types";

function Stat({ label, value, icon, to, tone = "default" }: { label: string; value: ReactNode; icon: ReactNode; to?: string; tone?: "default" | "attention" }) {
  const body = (
    <div className={`flex h-full items-start justify-between rounded-card bg-white p-5 ring-1 transition-shadow ${tone === "attention" ? "ring-amber-300" : "ring-slate-200"} ${to ? "hover:shadow-md" : ""}`}>
      <div>
        <p className="text-[13px] text-slate-500">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular text-slate-900">{value}</p>
      </div>
      <div className={`flex size-9 items-center justify-center rounded-xl ${tone === "attention" ? "bg-amber-50 text-amber-700" : "bg-navy-50 text-navy-700"}`}>{icon}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function OverviewPage() {
  const { admin, can } = useAuth();
  const q = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/admin/overview"), refetchInterval: 60_000 });
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${admin?.name.split(" ")[0] ?? ""}`} description="Here's what needs you today." />

      {q.isError ? (
        <Card>
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {q.data ? (
              <>
                <Stat
                  label="Drivers waiting for approval"
                  value={q.data.driversPending}
                  icon={<IdCard className="size-4" />}
                  to={can("drivers.read") ? "/drivers?status=PENDING" : undefined}
                  tone={q.data.driversPending ? "attention" : "default"}
                />
                <Stat
                  label="Ride fares to review"
                  value={q.data.ridesPending}
                  icon={<ClipboardCheck className="size-4" />}
                  to={can("rides.read") ? "/rides" : undefined}
                  tone={q.data.ridesPending ? "attention" : "default"}
                />
                <Stat label="Bookings, last 24 hours" value={q.data.bookingsLast24h} icon={<Ticket className="size-4" />} to={can("bookings.read") ? "/bookings" : undefined} />
                <Stat label="Collected, last 24 hours" value={inrFromPaise(q.data.revenueLast24h)} icon={<IndianRupee className="size-4" />} />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[98px] rounded-card" />)
            )}
          </div>

          {q.data && (q.data.refundsFailed > 0 || q.data.emptyRidesNext6h > 0) && (
            <div className="mt-4 space-y-2">
              {q.data.refundsFailed > 0 && (
                <Link to="/money" className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200 hover:bg-red-100/70">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span className="flex-1">
                    {q.data.refundsFailed} refund{q.data.refundsFailed > 1 ? "s" : ""} failed at the payment gateway and need a retry.
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              )}
              {q.data.emptyRidesNext6h > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  <CalendarClock className="size-4 shrink-0" />
                  {q.data.emptyRidesNext6h} ride{q.data.emptyRidesNext6h > 1 ? "s" : ""} leave in the next 6 hours with no bookings yet.
                </div>
              )}
            </div>
          )}

          <Card className="mt-6" padded={false}>
            <div className="px-5 pt-5">
              <CardTitle action={can("rides.read") && <Link to="/rides?status=OPEN" className="text-[13px] font-medium text-teal-700 hover:underline">All live rides</Link>}>
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
              <ul className="divide-y divide-slate-100">
                {q.data.upcomingRides.map((r) => {
                  const pct = Math.round((r.seatsSold / r.totalSeats) * 100);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
                      <div className="w-36">
                        <div className="text-sm font-medium tabular text-slate-900">{fmtDateTime(r.departureAt)}</div>
                        <div className="text-xs text-slate-500">{fromNow(r.departureAt)}</div>
                      </div>
                      <div className="min-w-40 flex-1">
                        <div className="text-sm font-medium text-slate-900">
                          {r.from} → {r.to}
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.driver} · {r.vehicleType}
                        </div>
                      </div>
                      <div className="w-40">
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span>
                            {r.seatsSold} of {r.totalSeats} seats
                          </span>
                          <span className="tabular">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
