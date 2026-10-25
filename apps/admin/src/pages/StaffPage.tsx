import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, ErrorState, PageHeader, Table, TableSkeleton, Td, Th } from "@/components/ui/Data";
import { SelectInput, TextInput, Toggle } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { roleLabel, useAuth } from "@/lib/auth";
import { fmtDate, initials } from "@/lib/format";
import type { AdminRole, AdminUser, City } from "@/lib/types";

const ROLE_HELP: Record<AdminRole, string> = {
  SUPER_ADMIN: "Everything, including settings, prices and staff.",
  LOCATION_ADMIN: "Drivers, ride fares and bookings in their cities.",
  SUPPORT: "Looks up drivers and bookings; cancels by the refund policy.",
  ACCOUNTANT: "Payments and refunds; can retry failed refunds.",
};

export function StaffPage() {
  const { admin: me } = useAuth();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/admin-users") });
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/admin/cities") });
  const [edit, setEdit] = useState<AdminUser | "new" | null>(null);
  const cityName = (id: string) => cities.data?.find((c) => c.id === id)?.name ?? "…";

  return (
    <>
      <PageHeader
        title="Admin users"
        description="Who can use this portal and what they can do."
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setEdit("new")}>
            Add admin
          </Button>
        }
      />
      <Card padded={false}>
        {q.isLoading ? (
          <TableSkeleton cols={4} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Cities</Th>
                <Th>Added</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.data?.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-700">{initials(a.name)}</div>
                      <div>
                        <div className="font-medium text-slate-900">
                          {a.name} {a.id === me?.id && <span className="text-xs font-normal text-slate-500">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">{a.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={a.role === "SUPER_ADMIN" ? "navy" : "gray"}>{roleLabel[a.role]}</Badge>
                  </Td>
                  <Td className="text-slate-600">{a.role === "LOCATION_ADMIN" ? a.cityIds.map(cityName).join(", ") : "All"}</Td>
                  <Td className="text-slate-600">{fmtDate(a.createdAt)}</Td>
                  <Td>
                    {!a.active ? <Badge tone="red">Disabled</Badge> : a.lockedUntil && new Date(a.lockedUntil) > new Date() ? <Badge tone="amber">Locked</Badge> : <Badge tone="green">Active</Badge>}
                  </Td>
                  <Td className="text-right">
                    <IconButton label={`Edit ${a.name}`} onClick={() => setEdit(a)}>
                      <Pencil className="size-4" />
                    </IconButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {edit && <AdminModal admin={edit === "new" ? null : edit} cities={cities.data ?? []} isSelf={edit !== "new" && edit.id === me?.id} onClose={() => setEdit(null)} />}
    </>
  );
}

function AdminModal({ admin, cities, isSelf, onClose }: { admin: AdminUser | null; cities: City[]; isSelf: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    name: admin?.name ?? "",
    email: admin?.email ?? "",
    role: admin?.role ?? ("LOCATION_ADMIN" as AdminRole),
    password: "",
    cityIds: admin?.cityIds ?? [],
    active: admin?.active ?? true,
  });
  const m = useMutation({
    mutationFn: () =>
      admin
        ? api(`/admin/admin-users/${admin.id}`, {
            method: "PUT",
            body: { name: f.name, role: f.role, cityIds: f.cityIds, active: f.active, ...(f.password ? { password: f.password } : {}) },
          })
        : api("/admin/admin-users", { method: "POST", body: { name: f.name, email: f.email, role: f.role, password: f.password, cityIds: f.cityIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast(admin ? "Admin updated" : "Admin added. Share the password with them securely.");
      onClose();
    },
  });
  const err = m.error instanceof ApiError ? m.error : null;
  const toggleCity = (id: string) => setF({ ...f, cityIds: f.cityIds.includes(id) ? f.cityIds.filter((c) => c !== id) : [...f.cityIds, id] });

  return (
    <Modal
      open
      onClose={onClose}
      title={admin ? `Edit ${admin.name}` : "Add an admin"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err?.field("name")} />
        {!admin && <TextInput label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err?.field("email")} />}
        <SelectInput label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AdminRole })} hint={ROLE_HELP[f.role]} disabled={isSelf}>
          {(Object.keys(roleLabel) as AdminRole[]).map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </SelectInput>
        {f.role === "LOCATION_ADMIN" && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-slate-700">Cities they manage</legend>
            <div className="flex flex-wrap gap-2">
              {cities.map((c) => (
                <label key={c.id} className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] ring-1 ring-inset ${f.cityIds.includes(c.id) ? "bg-teal-50 text-teal-900 ring-teal-500" : "ring-slate-300 text-slate-700"}`}>
                  <input type="checkbox" className="sr-only" checked={f.cityIds.includes(c.id)} onChange={() => toggleCity(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <TextInput
          label={admin ? "New password" : "Password"}
          type="password"
          autoComplete="new-password"
          hint={admin ? "Leave empty to keep the current password. Setting one also unlocks the account." : "At least 10 characters."}
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          error={err?.field("password")}
        />
        {admin && !isSelf && <Toggle label="Active" hint="Disabled admins are signed out at once and can't sign in." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        {m.error && !err?.details?.fields && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(m.error)}</p>}
      </div>
    </Modal>
  );
}
