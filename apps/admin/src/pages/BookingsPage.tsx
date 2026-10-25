import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Ban, Search, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, DetailList, EmptyState, ErrorState, PageHeader, Pagination, RowButton, SectionLabel, Skeleton, Table, TableSkeleton, Tabs, Td, Th } from "@/components/ui/Data";
import { SearchInput } from "@/components/ui/Field";
import { ConfirmDialog, Drawer } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtPhone, inrFromPaise, titleCase } from "@/lib/format";
import type { BookingDetail, BookingRow, BookingStatus, Page } from "@/lib/types";

type Filter = BookingStatus | "ALL";
const LIMIT = 25;

export function BookingsPage() {
  const [status, setStatus] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => (setQ(search.trim()), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ["bookings", status, q, page],
    queryFn: () => api<Page<BookingRow>>("/admin/bookings", { query: { status: status === "ALL" ? undefined : status, q, page, limit: LIMIT } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader title="Bookings" description="Search by booking code, customer phone or name." />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs<Filter>
            value={status}
            onChange={(s) => (setStatus(s), setPage(1))}
            options={[
              { value: "ALL", label: "All" },
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "HELD", label: "Awaiting payment" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "EXPIRED", label: "Expired" },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="PC-261101-1001 or 98765…" icon={<Search className="size-4" />} />
        </div>
        {list.isLoading ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Ticket className="size-5" />} title={q ? "No bookings match" : "No bookings yet"} body={q ? "Check the code or phone number." : "Bookings appear here as customers book."} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Booking</Th>
                  <Th>Customer</Th>
                  <Th>Ride</Th>
                  <Th className="text-right">Seats</Th>
                  <Th className="text-right">Paid</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((b) => (
                  <RowButton key={b.id} onClick={() => setSelected(b.id)} selected={selected === b.id}>
                    <Td>
                      <div className="font-medium tabular text-ink">{b.code}</div>
                      <div className="text-xs text-ink-2">Booked {fmtDateTime(b.createdAt)}</div>
                    </Td>
                    <Td>
                      <div className="text-ink">{b.customer.name ?? "—"}</div>
                      <div className="text-xs tabular text-ink-2">{fmtPhone(b.customer.phone)}</div>
                    </Td>
                    <Td>
                      <div className="text-ink">
                        {b.from} → {b.to}
                      </div>
                      <div className="text-xs tabular text-ink-2">{fmtDateTime(b.departureAt)}</div>
                    </Td>
                    <Td className="text-right tabular">{b.seats}</Td>
                    <Td className="text-right font-medium tabular">{inrFromPaise(b.total)}</Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                  </RowButton>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={list.data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
      <BookingDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

const timelineLabel: Record<string, string> = {
  "booking.confirmed": "Payment received, booking confirmed",
  "booking.cancelled": "Cancelled",
};

function BookingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<null | "POLICY" | "FULL">(null);
  const q = useQuery({ queryKey: ["booking", id], queryFn: () => api<BookingDetail>(`/admin/bookings/${id}`), enabled: !!id });
  const config = useQuery({ queryKey: ["config"], queryFn: () => api<{ refundPolicy: { label: string }[] }>("/config"), staleTime: 60_000 });
  const policyText = config.data?.refundPolicy.map((t) => t.label).join("; ");
  const b = q.data;

  const cancel = useMutation({
    mutationFn: (body: { reason: string; refund: "POLICY" | "FULL" }) =>
      api<{ refundAmount: number; refundPercent: number; refund: { status: string } | null }>(`/admin/bookings/${id}/cancel`, { method: "POST", body }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast(r.refundAmount > 0 ? `Cancelled. ${inrFromPaise(r.refundAmount)} (${r.refundPercent}%) refund ${r.refund?.status === "FAILED" ? "failed, retry it in Payments" : "sent"}.` : "Cancelled. No refund due.");
    },
  });

  const canCancel = b && (b.status === "CONFIRMED" || b.status === "HELD") && can("bookings.cancel");

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        title={b?.code ?? "Booking"}
        subtitle={b && <StatusBadge status={b.status} />}
        footer={
          canCancel ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setDialog("POLICY")}>
                Cancel by policy
              </Button>
              {can("bookings.fullRefund") && b?.status === "CONFIRMED" && (
                <Button variant="danger" onClick={() => setDialog("FULL")}>
                  Cancel with full refund
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {q.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : b ? (
          <>
            <div className="rounded-xl bg-navy-700 p-4 text-white">
              <div className="flex items-center gap-2 text-base font-semibold">
                {b.ride.route.fromCity.name} <ArrowRight className="size-4 text-white/60" /> {b.ride.route.toCity.name}
              </div>
              <div className="mt-1 text-sm text-white/75">
                {fmtDateTime(b.ride.departureAt)} · {b.ride.driver.user.name} · {b.ride.vehicle.registrationNo}
              </div>
            </div>

            {b.cancelReason && (
              <p className="mt-4 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
                Cancelled by {b.cancelledBy?.toLowerCase()} on {fmtDateTime(b.cancelledAt)}: {b.cancelReason}
              </p>
            )}

            <SectionLabel>Pickup and drop</SectionLabel>
            <DetailList
              items={[
                [`Pickup in ${b.ride.route.fromCity.name}`, b.pickup],
                [`Drop in ${b.ride.route.toCity.name}`, b.drop],
              ]}
            />

            <SectionLabel>Customer</SectionLabel>
            <DetailList
              items={[
                ["Name", b.customer.name ?? "—"],
                ["Phone", <span key="p" className="tabular">{fmtPhone(b.customer.phone)}</span>],
                ["Email", b.customer.email ?? "—"],
              ]}
            />

            <SectionLabel>Travellers</SectionLabel>
            <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
              {b.passengers.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <div>
                    <div className="text-ink">{p.name}</div>
                    <div className="text-xs text-ink-2">
                      {titleCase(p.gender)}, {p.age} · <span className="tabular">{fmtPhone(p.phone)}</span>
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>

            <SectionLabel>Fare</SectionLabel>
            <DetailList
              items={[
                [`${b.seats} seat${b.seats > 1 ? "s" : ""} × ${inrFromPaise(b.seatFare)}`, inrFromPaise(b.seatsAmount)],
                ...(b.pickupExtra ? [["Pickup extra", inrFromPaise(b.pickupExtra)] as [string, string]] : []),
                ...(b.dropExtra ? [["Drop extra", inrFromPaise(b.dropExtra)] as [string, string]] : []),
                [`GST ${b.gstRateBp / 100}% (${b.gstMode === "INCLUDED" ? "included" : "added"})`, inrFromPaise(b.gstAmount)],
                ["Customer paid", <span key="t" className="text-base">{inrFromPaise(b.total)}</span>],
                [`PrimeCabs commission (${b.commissionRateBp / 100}%)`, inrFromPaise(b.commissionAmount)],
                ["Driver earns", inrFromPaise(b.driverEarning)],
              ]}
            />

            <SectionLabel>Payments and refunds</SectionLabel>
            <div className="space-y-2">
              {b.payments.length === 0 && <p className="text-sm text-ink-2">No payment started.</p>}
              {b.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl ring-1 ring-line px-3.5 py-2.5 text-sm">
                  <div>
                    <div className="font-medium tabular">{inrFromPaise(p.amount)}</div>
                    <div className="text-xs text-ink-2 tabular">{p.providerPaymentId ?? p.providerOrderId}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
              {b.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                  <div>
                    <div className="font-medium tabular">Refund {inrFromPaise(r.amount)}</div>
                    <div className="text-xs text-ink-2">{r.tierLabel}</div>
                    {r.failureReason && <div className="text-xs text-danger">{r.failureReason}</div>}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>

            <SectionLabel>Timeline</SectionLabel>
            <ol className="relative ml-1.5 space-y-3 border-l border-line pl-4 text-sm">
              <li>
                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-line-strong" />
                <div className="text-ink">Seats held for payment</div>
                <div className="text-xs text-ink-2">{fmtDateTime(b.createdAt)}</div>
              </li>
              {b.timeline.map((t) => (
                <li key={t.id}>
                  <span className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${t.action === "booking.cancelled" ? "bg-danger" : "bg-teal-500"}`} />
                  <div className="text-ink">{timelineLabel[t.action] ?? t.action}</div>
                  <div className="text-xs text-ink-2">
                    {fmtDateTime(t.createdAt)} · {t.actorType.toLowerCase()}
                  </div>
                </li>
              ))}
              {b.status === "EXPIRED" && (
                <li>
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-line-strong" />
                  <div className="text-ink">Hold expired before payment</div>
                </li>
              )}
            </ol>
          </>
        ) : null}
      </Drawer>

      {b && (
        <ConfirmDialog
          open={!!dialog}
          onClose={() => setDialog(null)}
          title={dialog === "FULL" ? "Cancel with a full refund?" : "Cancel by the refund policy?"}
          body={
            b.status === "HELD" ? (
              "This booking isn't paid yet. Its seats will be released."
            ) : dialog === "FULL" ? (
              <>
                The customer gets <strong>{inrFromPaise(b.total)}</strong> back, whatever the time before departure. Use this when PrimeCabs or the driver is at fault.
              </>
            ) : (
              `The refund follows the time left before departure${policyText ? ` (${policyText})` : ""}. The seats go back on sale.`
            )
          }
          confirmLabel="Cancel booking"
          tone="danger"
          reasonLabel="Reason"
          reasonPlaceholder="For example: customer called, travel plans changed"
          onConfirm={(reason) => cancel.mutateAsync({ reason, refund: dialog ?? "POLICY" })}
        >
          <Badge tone="gray">Paid {inrFromPaise(b.total)}</Badge>
        </ConfirmDialog>
      )}
    </>
  );
}
