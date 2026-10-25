import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptIndianRupee, RotateCcw } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, ErrorState, PageHeader, Pagination, Table, TableSkeleton, Tabs, Td, Th } from "@/components/ui/Data";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, inrFromPaise } from "@/lib/format";
import type { Page, Payment, Refund } from "@/lib/types";

const LIMIT = 25;

export function MoneyPage() {
  const [tab, setTab] = useState<"refunds" | "payments">("refunds");
  return (
    <>
      <PageHeader title="Payments and refunds" description="Every payment received and every refund sent through the payment gateway." />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "refunds", label: "Refunds" },
            { value: "payments", label: "Payments" },
          ]}
        />
      </div>
      {tab === "refunds" ? <Refunds /> : <Payments />}
    </>
  );
}

function Refunds() {
  const [status, setStatus] = useState<"" | "FAILED" | "PENDING" | "PROCESSED">("");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ["refunds", status, page],
    queryFn: () => api<Page<Refund>>("/admin/refunds", { query: { status, page, limit: LIMIT } }),
    placeholderData: (p) => p,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api<Refund>(`/admin/refunds/${id}/retry`, { method: "POST", body: {} }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast(r.status === "PROCESSED" ? "Refund sent" : "The refund failed again. Check the gateway dashboard.", r.status === "PROCESSED" ? "success" : "error");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  return (
    <Card padded={false}>
      <div className="border-b border-line p-4">
        <Tabs
          value={status}
          onChange={(s) => (setStatus(s), setPage(1))}
          options={[
            { value: "", label: "All" },
            { value: "FAILED", label: "Failed" },
            { value: "PENDING", label: "Pending" },
            { value: "PROCESSED", label: "Sent" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <TableSkeleton cols={6} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<ReceiptIndianRupee className="size-5" />} title={status === "FAILED" ? "No failed refunds" : "No refunds"} body="Refunds appear here when bookings are cancelled." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>When</Th>
                <Th>Rule</Th>
                <Th>Reason</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium tabular">{r.booking?.code}</Td>
                  <Td className="tabular text-ink-2">{fmtDateTime(r.createdAt)}</Td>
                  <Td className="text-ink-2">{r.tierLabel}</Td>
                  <Td className="max-w-56 text-ink-2">
                    <div className="truncate" title={r.reason}>
                      {r.reason}
                    </div>
                    {r.failureReason && <div className="truncate text-xs text-danger">{r.failureReason}</div>}
                  </Td>
                  <Td className="text-right font-medium tabular">{inrFromPaise(r.amount)}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-right">
                    {r.status === "FAILED" && can("refunds.retry") && (
                      <Button size="sm" icon={<RotateCcw className="size-4" />} loading={retry.isPending && retry.variables === r.id} onClick={() => retry.mutate(r.id)}>
                        Retry
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} total={q.data.total} limit={LIMIT} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

function Payments() {
  const [status, setStatus] = useState<"" | "PAID" | "CREATED" | "FAILED">("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["payments", status, page],
    queryFn: () => api<Page<Payment>>("/admin/payments", { query: { status, page, limit: LIMIT } }),
    placeholderData: (p) => p,
  });

  return (
    <Card padded={false}>
      <div className="border-b border-line p-4">
        <Tabs
          value={status}
          onChange={(s) => (setStatus(s), setPage(1))}
          options={[
            { value: "", label: "All" },
            { value: "PAID", label: "Paid" },
            { value: "CREATED", label: "Started, not paid" },
            { value: "FAILED", label: "Failed" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <TableSkeleton cols={5} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<ReceiptIndianRupee className="size-5" />} title="No payments" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Gateway reference</Th>
                <Th>Paid at</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <div className="font-medium tabular">{p.booking.code}</div>
                    <div className="text-xs text-ink-2">{p.provider === "FAKE" ? "Test gateway" : "Razorpay"}</div>
                  </Td>
                  <Td className="text-xs tabular text-ink-2">
                    <div>{p.providerPaymentId ?? "—"}</div>
                    <div className="text-ink-3">{p.providerOrderId}</div>
                  </Td>
                  <Td className="tabular text-ink-2">{fmtDateTime(p.paidAt)}</Td>
                  <Td className="text-right font-medium tabular">{inrFromPaise(p.amount)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} total={q.data.total} limit={LIMIT} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
