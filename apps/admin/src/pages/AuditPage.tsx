import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, EmptyState, ErrorState, PageHeader, Pagination, Table, TableSkeleton, Tabs, Td, Th } from "@/components/ui/Data";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { AdminUser, AuditLog, Page } from "@/lib/types";

const LIMIT = 50;
const ENTITIES = ["", "driver", "ride", "booking", "refund", "document", "setting", "admin_user", "city", "route"] as const;

export function AuditPage() {
  const [entity, setEntity] = useState<(typeof ENTITIES)[number]>("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["audit", entity, page],
    queryFn: () => api<Page<AuditLog>>("/admin/audit-logs", { query: { entity, page, limit: LIMIT } }),
    placeholderData: (p) => p,
  });
  const admins = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/admin-users") });
  const actor = (l: AuditLog) => (l.actorType === "ADMIN" ? (admins.data?.find((a) => a.id === l.actorId)?.name ?? "Admin") : l.actorType === "SYSTEM" ? "System" : l.actorType.charAt(0) + l.actorType.slice(1).toLowerCase());

  return (
    <>
      <PageHeader title="Audit log" description="Every admin action and every status change, with what changed." />
      <Card padded={false}>
        <div className="border-b border-line p-4">
          <Tabs value={entity} onChange={(v) => (setEntity(v), setPage(1))} options={ENTITIES.map((e) => ({ value: e, label: e ? e.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : "All" }))} />
        </div>
        {q.isLoading ? (
          <TableSkeleton cols={4} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : !q.data?.items.length ? (
          <EmptyState icon={<History className="size-5" />} title="Nothing recorded yet" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-8" />
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Item</Th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((l) => {
                  const hasDetail = l.before != null || l.after != null;
                  const isOpen = open === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr className={hasDetail ? "cursor-pointer hover:bg-muted" : ""} onClick={() => hasDetail && setOpen(isOpen ? null : l.id)}>
                        <Td className="text-ink-3">{hasDetail && (isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}</Td>
                        <Td className="whitespace-nowrap tabular text-ink-2">{fmtDateTime(l.createdAt)}</Td>
                        <Td>{actor(l)}</Td>
                        <Td>
                          <Badge tone={l.action.includes("reject") || l.action.includes("cancel") || l.action.includes("fail") || l.action.includes("suspend") ? "red" : l.action.includes("approv") || l.action.includes("confirm") || l.action.includes("processed") ? "green" : "gray"}>
                            {l.action}
                          </Badge>
                        </Td>
                        <Td className="text-xs tabular text-ink-2">
                          {l.entity} {l.entityId && l.entityId.length > 24 ? l.entityId.slice(0, 8) : l.entityId}
                        </Td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={5} className="bg-muted px-5 py-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              {(["before", "after"] as const).map((k) => (
                                <div key={k}>
                                  <div className="mb-1 text-xs font-medium text-ink-2">{k === "before" ? "Before" : "After"}</div>
                                  <pre className="max-h-64 overflow-auto rounded-lg bg-card p-3 text-xs text-ink-2 ring-1 ring-line">{l[k] == null ? "—" : JSON.stringify(l[k], null, 2)}</pre>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} total={q.data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
