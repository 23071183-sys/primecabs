import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Eye, FileText, IdCard, Search, ShieldCheck, ShieldOff, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { DocumentViewer } from "@/components/DocumentViewer";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, DetailList, EmptyState, ErrorState, PageHeader, Pagination, RowButton, SectionLabel, Skeleton, Table, TableSkeleton, Tabs, Td, Th } from "@/components/ui/Data";
import { SearchInput } from "@/components/ui/Field";
import { ConfirmDialog, Drawer } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtPhone, fromNow, initials } from "@/lib/format";
import type { DriverDetail, DriverRow, Page } from "@/lib/types";

type Filter = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | "DRAFT" | "ALL";
const LIMIT = 25;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DriversPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as Filter) ?? "PENDING";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const selected = params.get("id");

  const list = useQuery({
    queryKey: ["drivers", status, q, page],
    queryFn: () => api<Page<DriverRow>>("/admin/drivers", { query: { status: status === "ALL" ? undefined : status, q, page, limit: LIMIT } }),
    placeholderData: (prev) => prev,
  });

  const setStatus = (s: Filter) => {
    setPage(1);
    setParams((p) => {
      p.set("status", s);
      p.delete("id");
      return p;
    });
  };
  const open = (id: string | null) =>
    setParams((p) => {
      if (id) p.set("id", id);
      else p.delete("id");
      return p;
    });

  return (
    <>
      <PageHeader title="Drivers" description="Check documents and approve drivers before they can publish rides. Aim to review the same day." />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs<Filter>
            value={status}
            onChange={setStatus}
            options={[
              { value: "PENDING", label: "Waiting for review" },
              { value: "APPROVED", label: "Approved" },
              { value: "REJECTED", label: "Rejected" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "DRAFT", label: "Not submitted" },
              { value: "ALL", label: "All" },
            ]}
          />
          <SearchInput value={search} onChange={(v) => (setSearch(v), setPage(1))} placeholder="Name, phone or vehicle number" icon={<Search className="size-4" />} />
        </div>
        {list.isLoading ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={<IdCard className="size-5" />}
            title={status === "PENDING" ? "No drivers waiting" : "No drivers here"}
            body={status === "PENDING" ? "New sign-ups appear here once the driver submits their documents." : "Try another filter or search."}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Driver</Th>
                  <Th>Vehicles</Th>
                  <Th>Home city</Th>
                  <Th>Submitted</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((d) => (
                  <RowButton key={d.id} onClick={() => open(d.id)} selected={selected === d.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-info-bg text-xs font-semibold text-brand-ink">{initials(d.name)}</div>
                        <div>
                          <div className="font-medium text-ink">{d.name ?? "No name yet"}</div>
                          <div className="text-xs text-ink-2 tabular">{fmtPhone(d.phone)}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-ink-2">{d.vehicles.length ? d.vehicles.join(", ") : <span className="text-ink-3">None yet</span>}</Td>
                    <Td className="text-ink-2">{d.homeCity ?? "—"}</Td>
                    <Td className="text-ink-2">{d.submittedAt ? fromNow(d.submittedAt) : "—"}</Td>
                    <Td>
                      <StatusBadge status={d.status} />
                    </Td>
                  </RowButton>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={list.data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
      <DriverDrawer id={selected} onClose={() => open(null)} />
    </>
  );
}

type Dialog = null | "approve" | "reject" | "suspend" | "reinstate" | { kind: "rejectDoc"; id: string; label: string } | { kind: "rejectVehicle"; id: string; label: string };

function DriverDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [viewing, setViewing] = useState<{ id: string; title: string } | null>(null);

  const q = useQuery({ queryKey: ["driver", id], queryFn: () => api<DriverDetail>(`/admin/drivers/${id}`), enabled: !!id });
  const d = q.data;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["drivers"] });
    qc.invalidateQueries({ queryKey: ["driver", id] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(path, { method: "POST", body: body ?? {} }),
    onSuccess: refresh,
  });

  const review = can("drivers.review");
  const vehicleName = (vid: string | null) => {
    const v = d?.vehicles.find((x) => x.id === vid);
    return v ? `${v.type.name} · ${v.registrationNo}` : "";
  };
  const docFor = (item: DriverDetail["checklist"]["items"][number]) => d?.documents.find((x) => x.id === item.documentId);

  const footer =
    d && review ? (
      <div className="flex flex-wrap justify-end gap-2">
        {d.status === "PENDING" && (
          <>
            <Button variant="danger" icon={<XCircle className="size-4" />} onClick={() => setDialog("reject")}>
              Reject
            </Button>
            <Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={() => setDialog("approve")} disabled={d.checklist.missing.length > 0}>
              Approve driver
            </Button>
          </>
        )}
        {d.status === "APPROVED" && (
          <Button variant="danger" icon={<ShieldOff className="size-4" />} onClick={() => setDialog("suspend")}>
            Suspend
          </Button>
        )}
        {d.status === "SUSPENDED" && (
          <Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={() => setDialog("reinstate")}>
            Reinstate
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        title={d ? (d.name ?? "Driver") : "Driver"}
        subtitle={d && (
          <span className="flex items-center gap-2">
            <StatusBadge status={d.status} />
            <span className="tabular">{fmtPhone(d.phone)}</span>
          </span>
        )}
        footer={footer}
      >
        {q.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : d ? (
          <>
            {d.status === "REJECTED" && d.rejectionReason && (
              <p className="mb-4 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger">Rejected: {d.rejectionReason}</p>
            )}
            {d.status === "SUSPENDED" && d.rejectionReason && (
              <p className="mb-4 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger">Suspended: {d.rejectionReason}</p>
            )}
            {d.status === "PENDING" && d.checklist.missing.length > 0 && (
              <p className="mb-4 flex gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                Can't approve yet. Missing or rejected: {d.checklist.missing.map((m) => m.label).join(", ")}.
              </p>
            )}

            <SectionLabel>Profile</SectionLabel>
            <DetailList
              items={[
                ["Home city", d.homeCity?.name ?? "—"],
                ["Email", d.email ?? "—"],
                ["Age and gender", [d.age, d.gender && d.gender.toLowerCase()].filter(Boolean).join(", ") || "—"],
                ["Payout", d.bank.accountNoLast4 ? `${d.bank.accountName ?? ""} · A/c ••${d.bank.accountNoLast4} · ${d.bank.ifsc}` : d.bank.upiId ? `UPI ${d.bank.upiId}` : "—"],
                ["Submitted", fmtDateTime(d.submittedAt)],
              ]}
            />

            <SectionLabel>Vehicles</SectionLabel>
            <div className="space-y-2">
              {d.vehicles.length === 0 && <p className="text-sm text-ink-2">No vehicles added.</p>}
              {d.vehicles.map((v) => (
                <div key={v.id} className="rounded-xl ring-1 ring-line p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-ink">
                        {v.make} {v.model}
                        <Badge tone={v.plateType === "YELLOW" ? "amber" : "gray"}>{v.plateType === "YELLOW" ? "Yellow plate" : "White plate"}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-2 tabular">
                        {v.registrationNo} · {v.type.name} · {v.type.passengerSeats} seats · {v.year} · {v.colour}
                      </div>
                      {v.rejectionReason && v.status === "REJECTED" && <div className="mt-1 text-xs text-danger">{v.rejectionReason}</div>}
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                  {review && d.status === "APPROVED" && v.status === "PENDING" && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: `/admin/vehicles/${v.id}/approve` }, { onSuccess: () => toast("Vehicle approved") })}>
                        Approve vehicle
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDialog({ kind: "rejectVehicle", id: v.id, label: v.registrationNo })}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <SectionLabel>Documents</SectionLabel>
            <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
              {d.checklist.items
                .filter((i) => i.required || i.documentId)
                .map((item) => {
                  const doc = docFor(item);
                  return (
                    <li key={`${item.documentTypeId}-${item.vehicleId}`} className="flex items-center gap-3 px-3.5 py-2.5">
                      <FileText className="size-4 shrink-0 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink">{item.label}</div>
                        <div className="text-xs text-ink-2">
                          {item.vehicleId ? vehicleName(item.vehicleId) : "Driver"}
                          {doc?.expiryDate ? ` · expires ${fmtDate(doc.expiryDate)}` : ""}
                          {!item.required && " · optional"}
                        </div>
                      </div>
                      {!doc ? (
                        <Badge tone="red">Missing</Badge>
                      ) : (
                        <>
                          {doc.status === "APPROVED" ? (
                            <CheckCircle2 className="size-4 text-success" aria-label="Approved" />
                          ) : doc.status === "REJECTED" ? (
                            <Badge tone="red">Rejected</Badge>
                          ) : (
                            <Badge tone="amber">To check</Badge>
                          )}
                          <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setViewing({ id: doc.id, title: `${item.label}${item.vehicleId ? ` · ${vehicleName(item.vehicleId)}` : ""}` })}>
                            View
                          </Button>
                          {review && doc.status === "PENDING" && (
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDialog({ kind: "rejectDoc", id: doc.id, label: item.label })}>
                              Reject
                            </Button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
            </ul>
          </>
        ) : null}
      </Drawer>

      {d && (
        <>
          <ConfirmDialog
            open={dialog === "approve"}
            onClose={() => setDialog(null)}
            title={`Approve ${d.name}?`}
            body="This also approves their pending documents and vehicles. They can publish rides straight away."
            confirmLabel="Approve driver"
            onConfirm={async () => {
              await act.mutateAsync({ path: `/admin/drivers/${d.id}/approve` });
              toast(`${d.name} is approved`);
            }}
          />
          <ConfirmDialog
            open={dialog === "reject"}
            onClose={() => setDialog(null)}
            title={`Reject ${d.name}?`}
            body="The driver sees your reason in the app and can fix their details and submit again."
            confirmLabel="Reject"
            tone="danger"
            reasonLabel="Reason shown to the driver"
            reasonPlaceholder="For example: the driving licence photo is blurred. Upload a clear photo."
            onConfirm={async (reason) => {
              await act.mutateAsync({ path: `/admin/drivers/${d.id}/reject`, body: { reason } });
              toast("Driver rejected");
            }}
          />
          <ConfirmDialog
            open={dialog === "suspend"}
            onClose={() => setDialog(null)}
            title={`Suspend ${d.name}?`}
            body="Their rides stop appearing in search. Existing bookings are not cancelled automatically; cancel those rides separately if needed."
            confirmLabel="Suspend"
            tone="danger"
            reasonLabel="Reason"
            onConfirm={async (reason) => {
              await act.mutateAsync({ path: `/admin/drivers/${d.id}/suspend`, body: { reason } });
              toast("Driver suspended");
            }}
          />
          <ConfirmDialog
            open={dialog === "reinstate"}
            onClose={() => setDialog(null)}
            title={`Reinstate ${d.name}?`}
            body="They will be able to publish rides again."
            confirmLabel="Reinstate"
            onConfirm={async () => {
              await act.mutateAsync({ path: `/admin/drivers/${d.id}/reinstate` });
              toast("Driver reinstated");
            }}
          />
          <ConfirmDialog
            open={typeof dialog === "object" && dialog?.kind === "rejectDoc"}
            onClose={() => setDialog(null)}
            title={`Reject ${typeof dialog === "object" && dialog ? dialog.label : ""}?`}
            body="The driver will be asked to upload it again."
            confirmLabel="Reject document"
            tone="danger"
            reasonLabel="What's wrong with it?"
            reasonPlaceholder="For example: the expiry date isn't visible"
            onConfirm={async (reason) => {
              if (typeof dialog === "object" && dialog) await act.mutateAsync({ path: `/admin/documents/${dialog.id}/reject`, body: { reason } });
              toast("Document rejected");
            }}
          />
          <ConfirmDialog
            open={typeof dialog === "object" && dialog?.kind === "rejectVehicle"}
            onClose={() => setDialog(null)}
            title={`Reject vehicle ${typeof dialog === "object" && dialog ? dialog.label : ""}?`}
            confirmLabel="Reject vehicle"
            tone="danger"
            reasonLabel="Reason shown to the driver"
            onConfirm={async (reason) => {
              if (typeof dialog === "object" && dialog) await act.mutateAsync({ path: `/admin/vehicles/${dialog.id}/reject`, body: { reason } });
              toast("Vehicle rejected");
            }}
          />
        </>
      )}
      <DocumentViewer docId={viewing?.id ?? null} title={viewing?.title ?? ""} onClose={() => setViewing(null)} />
    </>
  );
}
