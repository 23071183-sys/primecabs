import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Ban, Check, ClipboardCheck, Pencil, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, DetailList, EmptyState, ErrorState, PageHeader, Pagination, RowButton, SectionLabel, Table, TableSkeleton, Tabs, Td, Th } from "@/components/ui/Data";
import { TextInput } from "@/components/ui/Field";
import { ConfirmDialog, Drawer } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtPhone, fmtTime, fromNow, inrFromPaise, paiseFromRupees, rupeesFromPaise } from "@/lib/format";
import type { Page, RideRow, RideStatus } from "@/lib/types";

type Filter = "PENDING_APPROVAL" | "OPEN" | "FULL" | "STARTED" | "COMPLETED" | "REJECTED" | "CANCELLED";
const LIMIT = 25;

/** "+10% vs reference" with a tone: amber above, green at or below. */
export function fareDiff(proposed: number, reference: number | null) {
  if (!reference) return null;
  const pct = Math.round(((proposed - reference) / reference) * 100);
  if (pct === 0) return { label: "matches reference", tone: "green" as const };
  return pct > 0 ? { label: `${pct}% above reference`, tone: "amber" as const } : { label: `${-pct}% below reference`, tone: "green" as const };
}

export function RidesPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as Filter) ?? "PENDING_APPROVAL";
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RideRow | null>(null);

  const list = useQuery({
    queryKey: ["rides", status, page],
    queryFn: () => api<Page<RideRow>>("/admin/rides", { query: { status, page, limit: LIMIT } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader title="Ride approvals" description="Drivers propose the fare per seat. A ride only appears to customers after you approve its fare." />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4">
          <Tabs<Filter>
            value={status}
            onChange={(s) => {
              setPage(1);
              setParams({ status: s });
            }}
            options={[
              { value: "PENDING_APPROVAL", label: "Waiting for review", count: status === "PENDING_APPROVAL" ? list.data?.total : undefined },
              { value: "OPEN", label: "Live" },
              { value: "FULL", label: "Full" },
              { value: "STARTED", label: "On trip" },
              { value: "COMPLETED", label: "Completed" },
              { value: "REJECTED", label: "Rejected" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        </div>
        {list.isLoading ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={<ClipboardCheck className="size-5" />}
            title={status === "PENDING_APPROVAL" ? "Nothing to review" : "No rides here"}
            body={status === "PENDING_APPROVAL" ? "When a driver publishes a ride, its fare waits here for you." : undefined}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Driver and route</Th>
                  <Th>Departs</Th>
                  <Th>Vehicle</Th>
                  <Th className="text-right">Seats</Th>
                  <Th className="text-right">Fare per seat</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => {
                  const diff = fareDiff(r.seatFare ?? r.proposedSeatFare, r.referenceSeatFare);
                  return (
                    <RowButton key={r.id} onClick={() => setSelected(r)} selected={selected?.id === r.id}>
                      <Td className="whitespace-nowrap">
                        <div className="font-medium text-slate-900">{r.driver.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.from} → {r.to}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="tabular text-slate-900">{fmtDateTime(r.departureAt)}</div>
                        <div className="text-xs text-slate-500">{fromNow(r.departureAt)}</div>
                      </Td>
                      <Td className="text-slate-600">
                        {r.vehicle.type}
                        <div className="text-xs tabular text-slate-500">{r.vehicle.registrationNo}</div>
                      </Td>
                      <Td className="text-right tabular text-slate-600">
                        {r.status === "PENDING_APPROVAL" ? r.totalSeats : `${r.totalSeats - r.availableSeats}/${r.totalSeats}`}
                      </Td>
                      <Td className="text-right">
                        <div className="font-medium tabular text-slate-900">{inrFromPaise(r.seatFare ?? r.proposedSeatFare)}</div>
                        {diff && status === "PENDING_APPROVAL" && <div className={`text-xs ${diff.tone === "amber" ? "text-amber-700" : "text-emerald-700"}`}>{diff.label}</div>}
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                    </RowButton>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} total={list.data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
      <RideDrawer ride={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function RideDrawer({ ride, onClose }: { ride: RideRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<null | "approve" | "change" | "reject" | "cancel">(null);
  const [fare, setFare] = useState("");
  const fareError = fare && paiseFromRupees(fare) === null ? "Enter an amount like 550" : undefined;

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(path, { method: "POST", body: body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rides"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      onClose();
    },
  });

  if (!ride) return null;
  const pending = ride.status === "PENDING_APPROVAL";
  const diff = fareDiff(ride.proposedSeatFare, ride.referenceSeatFare);
  const cancellable: RideStatus[] = ["PENDING_APPROVAL", "OPEN", "FULL"];

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            {ride.from} <ArrowRight className="size-4 text-slate-400" /> {ride.to}
          </span>
        }
        subtitle={`${fmtDateTime(ride.departureAt)} to ${fmtTime(ride.arrivalAt)}`}
        width="max-w-md"
        footer={
          <div className="flex flex-col gap-2">
            {pending && can("rides.review") && (
              <>
                <Button variant="primary" icon={<Check className="size-4" />} onClick={() => setDialog("approve")} className="w-full">
                  Approve at {inrFromPaise(ride.proposedSeatFare)}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    icon={<Pencil className="size-4" />}
                    onClick={() => {
                      setFare(rupeesFromPaise(ride.referenceSeatFare ?? ride.proposedSeatFare));
                      setDialog("change");
                    }}
                  >
                    Change fare
                  </Button>
                  <Button variant="danger" icon={<X className="size-4" />} onClick={() => setDialog("reject")}>
                    Reject
                  </Button>
                </div>
              </>
            )}
            {!pending && cancellable.includes(ride.status) && can("rides.cancel") && (
              <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setDialog("cancel")} className="w-full">
                Cancel ride
              </Button>
            )}
          </div>
        }
      >
        <div className="mb-5 flex items-center gap-2">
          <StatusBadge status={ride.status} />
          {ride.confirmedBookings > 0 && <Badge tone="navy">{ride.confirmedBookings} bookings</Badge>}
        </div>

        <SectionLabel>Fare</SectionLabel>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-slate-500">{pending ? "Proposed by driver" : "Approved fare"}</div>
              <div className="text-2xl font-semibold tabular text-slate-900">{inrFromPaise(ride.seatFare ?? ride.proposedSeatFare)}</div>
              <div className="text-xs text-slate-500">per seat, GST included</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Route reference</div>
              <div className="text-base font-medium tabular text-slate-700">{inrFromPaise(ride.referenceSeatFare)}</div>
            </div>
          </div>
          {diff && pending && (
            <div className="mt-3">
              <Badge tone={diff.tone}>{diff.label}</Badge>
            </div>
          )}
          {!pending && ride.seatFare !== ride.proposedSeatFare && (
            <p className="mt-3 text-xs text-slate-500">The driver proposed {inrFromPaise(ride.proposedSeatFare)}.</p>
          )}
        </div>

        <SectionLabel>Ride</SectionLabel>
        <DetailList
          items={[
            ["Driver", <span key="d">{ride.driver.name} <span className="font-normal text-slate-500 tabular">{fmtPhone(ride.driver.phone)}</span></span>],
            ["Vehicle", `${ride.vehicle.type} · ${ride.vehicle.registrationNo}`],
            ["Plate", ride.vehicle.plateType === "YELLOW" ? "Yellow (commercial)" : "White (private)"],
            ["Seats", pending ? `${ride.totalSeats} offered` : `${ride.totalSeats - ride.availableSeats} sold of ${ride.totalSeats}`],
            ["Value if every seat sells", inrFromPaise((ride.seatFare ?? ride.proposedSeatFare) * ride.totalSeats)],
          ]}
        />
      </Drawer>

      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        title="Approve this ride?"
        body={`Customers will see it straight away at ${inrFromPaise(ride.proposedSeatFare)} per seat.`}
        confirmLabel="Approve"
        onConfirm={async () => {
          await act.mutateAsync({ path: `/admin/rides/${ride.id}/approve` });
          toast("Ride approved and live");
        }}
      />
      <ConfirmDialog
        open={dialog === "change"}
        onClose={() => setDialog(null)}
        title="Approve with a different fare"
        body="The ride goes live at this fare. The driver sees the change and can cancel if they don't agree."
        confirmLabel="Approve at new fare"
        canConfirm={!fareError && !!fare}
        onConfirm={async () => {
          const paise = paiseFromRupees(fare);
          if (!paise) throw new Error("Enter a valid fare");
          await act.mutateAsync({ path: `/admin/rides/${ride.id}/approve`, body: { seatFare: paise } });
          toast(`Ride approved at ${inrFromPaise(paise)}`);
        }}
      >
        <TextInput label="Fare per seat" prefix="₹" inputMode="decimal" value={fare} onChange={(e) => setFare(e.target.value)} error={fareError} hint={`Driver asked for ${inrFromPaise(ride.proposedSeatFare)}. Reference is ${inrFromPaise(ride.referenceSeatFare)}.`} />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Reject this ride?"
        body="The driver can edit the ride and send it again."
        confirmLabel="Reject ride"
        tone="danger"
        reasonLabel="Reason shown to the driver"
        reasonPlaceholder="For example: the fare is too high for this route"
        onConfirm={async (reason) => {
          await act.mutateAsync({ path: `/admin/rides/${ride.id}/reject`, body: { reason } });
          toast("Ride rejected");
        }}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="Cancel this ride?"
        body={
          ride.confirmedBookings > 0
            ? `${ride.confirmedBookings} confirmed booking${ride.confirmedBookings > 1 ? "s" : ""} will be cancelled and refunded 100%. This can't be undone.`
            : "No one has booked yet. This can't be undone."
        }
        confirmLabel="Cancel ride"
        tone="danger"
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          await act.mutateAsync({ path: `/admin/rides/${ride.id}/cancel`, body: { reason } });
          toast("Ride cancelled. Customers have been refunded.");
        }}
      />
    </>
  );
}
