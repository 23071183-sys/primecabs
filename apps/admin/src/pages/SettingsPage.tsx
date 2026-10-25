// Business settings admin can change without a developer (8.3). Only super admins can save.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardTitle, ErrorState, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui/Data";
import { SelectInput, TextInput, Toggle } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { inrFromPaise } from "@/lib/format";
import type { DocumentType, Settings, VehicleType } from "@/lib/types";

type Key = keyof Settings;

function useSaveSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: Key; value: unknown }) => api(`/admin/settings/${key}`, { method: "PUT", body: { value } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

function Section({ title, description, children, onSave, saving, dirty, editable }: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  editable: boolean;
}) {
  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div>
          <fieldset disabled={!editable} className="space-y-4">
            {children}
          </fieldset>
          {editable && (
            <div className="mt-5 flex justify-end">
              <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={onSave}>
                Save changes
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Local draft of one setting; `dirty` once it differs from what's saved. */
function useDraft<T>(saved: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(saved);
  // Compare by content: some saved values are rebuilt as new objects on every render.
  const key = JSON.stringify(saved);
  useEffect(() => setDraft(key === undefined ? undefined : (JSON.parse(key) as T)), [key]);
  return [draft, setDraft, JSON.stringify(draft) !== key] as const;
}

const num = (v: string) => (v === "" ? NaN : Number(v));

export function SettingsPage() {
  const { can } = useAuth();
  const editable = can("settings.write");
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/admin/settings") });
  const save = useSaveSetting();
  const s = q.data;

  const [gst, setGst, gstDirty] = useDraft(s?.gst);
  const [commission, setCommission, commissionDirty] = useDraft(s?.commission);
  const [booking, setBooking, bookingDirty] = useDraft(
    s && { seatHoldMinutes: s.seatHoldMinutes, bookingHorizonDays: s.bookingHorizonDays, bookingCutoffMinutes: s.bookingCutoffMinutes, boardingOpensMinutesBefore: s.boardingOpensMinutesBefore },
  );
  const [tiers, setTiers, tiersDirty] = useDraft(s?.refundTiers);
  const [support, setSupport, supportDirty] = useDraft(s?.support);
  const [otp, setOtp, otpDirty] = useDraft(s && { ...s.loginOtp, tripOtpMaxAttempts: s.tripOtpMaxAttempts });

  const toast = useToast();
  // One section can write several keys; show a single message for the whole save.
  const saveMany = async (pairs: [Key, unknown][]) => {
    try {
      const changed = pairs.filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(s?.[key]));
      for (const [key, value] of changed) await save.mutateAsync({ key, value });
      toast("Saved. It applies to new bookings from now on.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (q.isError) {
    return (
      <>
        <PageHeader title="Settings" />
        <Card>
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Changes apply to new bookings. Existing bookings keep the price and rules they were made with."
        actions={!editable && <Badge tone="gray"><Lock className="size-3" /> Only a super admin can change these</Badge>}
      />
      {!s || !gst || !commission || !booking || !tiers || !support || !otp ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Section
            title="GST"
            description="Included: the seat price already contains GST (current choice, 4.5). Added: GST is charged on top."
            editable={editable}
            dirty={gstDirty}
            saving={save.isPending}
            onSave={() => saveMany([["gst", gst]])}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput label="How GST is charged" value={gst.mode} onChange={(e) => setGst({ ...gst, mode: e.target.value as Settings["gst"]["mode"] })}>
                <option value="INCLUDED">Included in the price</option>
                <option value="ADDED">Added on top of the price</option>
              </SelectInput>
              <TextInput label="GST rate" suffix="%" inputMode="decimal" value={String(gst.ratePercent)} onChange={(e) => setGst({ ...gst, ratePercent: num(e.target.value) })} />
            </div>
            <p className="text-xs text-slate-500">
              Example: a ₹550 seat {gst.mode === "INCLUDED" ? `includes ${inrFromPaise(Math.round((55000 * gst.ratePercent) / (100 + gst.ratePercent)))} GST` : `costs ${inrFromPaise(Math.round(55000 * (1 + gst.ratePercent / 100)))} with GST`}.
            </p>
          </Section>

          <Section
            title="Commission"
            description="PrimeCabs' share, taken from the fare before GST. The client's form gave conflicting answers here (4.6, 4.7 and 14.6), so confirm this with them."
            editable={editable}
            dirty={commissionDirty}
            saving={save.isPending}
            onSave={() => saveMany([["commission", commission]])}
          >
            <SelectInput label="Model" value={commission.model} onChange={(e) => setCommission({ ...commission, model: e.target.value as Settings["commission"]["model"] })}>
              <option value="BY_PLATE">Different % for yellow and white plates</option>
              <option value="FLAT">Same % for every driver</option>
            </SelectInput>
            {commission.model === "BY_PLATE" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Yellow plate (commercial)" suffix="%" inputMode="decimal" value={String(commission.yellowPercent)} onChange={(e) => setCommission({ ...commission, yellowPercent: num(e.target.value) })} />
                <TextInput label="White plate (private)" suffix="%" inputMode="decimal" value={String(commission.whitePercent)} onChange={(e) => setCommission({ ...commission, whitePercent: num(e.target.value) })} />
              </div>
            ) : (
              <TextInput label="Commission" suffix="%" inputMode="decimal" value={String(commission.percent)} onChange={(e) => setCommission({ ...commission, percent: num(e.target.value) })} />
            )}
          </Section>

          <Section
            title="Booking window"
            description="How long seats are held while the customer pays, how far ahead they can book, and when booking closes."
            editable={editable}
            dirty={bookingDirty}
            saving={save.isPending}
            onSave={() =>
              saveMany([
                ["seatHoldMinutes", booking.seatHoldMinutes],
                ["bookingHorizonDays", booking.bookingHorizonDays],
                ["bookingCutoffMinutes", booking.bookingCutoffMinutes],
                ["boardingOpensMinutesBefore", booking.boardingOpensMinutesBefore],
              ])
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Seat hold while paying" suffix="minutes" inputMode="numeric" value={String(booking.seatHoldMinutes)} onChange={(e) => setBooking({ ...booking, seatHoldMinutes: num(e.target.value) })} />
              <TextInput label="Book up to" suffix="days ahead" inputMode="numeric" value={String(booking.bookingHorizonDays)} onChange={(e) => setBooking({ ...booking, bookingHorizonDays: num(e.target.value) })} />
              <TextInput label="Booking closes" suffix="min before" inputMode="numeric" value={String(booking.bookingCutoffMinutes)} onChange={(e) => setBooking({ ...booking, bookingCutoffMinutes: num(e.target.value) })} />
              <TextInput label="Boarding opens" suffix="min before" inputMode="numeric" value={String(booking.boardingOpensMinutesBefore)} onChange={(e) => setBooking({ ...booking, boardingOpensMinutesBefore: num(e.target.value) })} />
            </div>
          </Section>

          <Section
            title="Cancellation refunds"
            description="What a customer gets back when they cancel, by hours left before departure. A tier applies from its hour mark upwards. Cancellations by the driver or PrimeCabs always refund 100%."
            editable={editable}
            dirty={tiersDirty}
            saving={save.isPending}
            onSave={() => saveMany([["refundTiers", tiers]])}
          >
            <div className="space-y-2">
              {[...tiers]
                .map((t, i) => ({ ...t, i }))
                .sort((a, b) => b.minHoursBefore - a.minHoursBefore)
                .map((t) => (
                  <div key={t.i} className="flex items-end gap-3">
                    <div className="flex-1">
                      <TextInput label="From" suffix="hours before" inputMode="decimal" value={String(t.minHoursBefore)} onChange={(e) => setTiers(tiers.map((x, j) => (j === t.i ? { ...x, minHoursBefore: num(e.target.value) } : x)))} />
                    </div>
                    <div className="flex-1">
                      <TextInput label="Refund" suffix="%" inputMode="numeric" value={String(t.percent)} onChange={(e) => setTiers(tiers.map((x, j) => (j === t.i ? { ...x, percent: num(e.target.value) } : x)))} />
                    </div>
                    {editable && tiers.length > 1 && (
                      <IconButton label="Remove tier" onClick={() => setTiers(tiers.filter((_, j) => j !== t.i))} className="mb-0.5">
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </div>
                ))}
            </div>
            {editable && (
              <Button size="sm" variant="ghost" className="-ml-2" icon={<Plus className="size-4" />} onClick={() => setTiers([...tiers, { minHoursBefore: 48, percent: 100 }])}>
                Add tier
              </Button>
            )}
            {!tiers.some((t) => t.minHoursBefore === 0) && <p className="text-xs text-red-600">Keep a tier starting at 0 hours.</p>}
          </Section>

          <Section
            title="Sign-in and trip codes"
            description="SMS codes for signing in, and the 4-digit boarding codes each passenger gives the driver."
            editable={editable}
            dirty={otpDirty}
            saving={save.isPending}
            onSave={() => {
              const { tripOtpMaxAttempts, ...loginOtp } = otp;
              return saveMany([
                ["loginOtp", loginOtp],
                ["tripOtpMaxAttempts", tripOtpMaxAttempts],
              ]);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <TextInput label="Code length" suffix="digits" inputMode="numeric" value={String(otp.length)} onChange={(e) => setOtp({ ...otp, length: num(e.target.value) })} />
              <TextInput label="Code expires after" suffix="seconds" inputMode="numeric" value={String(otp.ttlSeconds)} onChange={(e) => setOtp({ ...otp, ttlSeconds: num(e.target.value) })} />
              <TextInput label="Wrong tries allowed" inputMode="numeric" value={String(otp.maxAttempts)} onChange={(e) => setOtp({ ...otp, maxAttempts: num(e.target.value) })} />
              <TextInput label="Wait before resend" suffix="seconds" inputMode="numeric" value={String(otp.resendSeconds)} onChange={(e) => setOtp({ ...otp, resendSeconds: num(e.target.value) })} />
              <TextInput label="Codes per hour" inputMode="numeric" value={String(otp.maxPerHour)} onChange={(e) => setOtp({ ...otp, maxPerHour: num(e.target.value) })} />
              <TextInput label="Boarding code tries" inputMode="numeric" value={String(otp.tripOtpMaxAttempts)} onChange={(e) => setOtp({ ...otp, tripOtpMaxAttempts: num(e.target.value) })} />
            </div>
          </Section>

          <Section title="Support contact" description="Shown on every e-ticket." editable={editable} dirty={supportDirty} saving={save.isPending} onSave={() => saveMany([["support", support]])}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Phone" value={support.phone} onChange={(e) => setSupport({ ...support, phone: e.target.value })} />
              <TextInput label="Email" type="email" value={support.email} onChange={(e) => setSupport({ ...support, email: e.target.value })} />
            </div>
          </Section>

          <VehicleTypes editable={can("config.write")} />
          <DocumentTypes editable={can("config.write")} />
        </div>
      )}
    </>
  );
}

function VehicleTypes({ editable }: { editable: boolean }) {
  const q = useQuery({ queryKey: ["vehicle-types"], queryFn: () => api<VehicleType[]>("/admin/vehicle-types") });
  const [edit, setEdit] = useState<VehicleType | "new" | null>(null);
  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardTitle action={editable && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit("new")}>Add type</Button>}>Vehicle types</CardTitle>
        <p className="-mt-2 mb-4 text-sm text-slate-500">Passenger seats exclude the driver. A driver can publish fewer seats but never more.</p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Code</Th>
            <Th className="text-right">Passenger seats</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.data?.map((t) => (
            <tr key={t.id}>
              <Td className="font-medium">{t.name}</Td>
              <Td className="text-xs tabular text-slate-500">{t.code}</Td>
              <Td className="text-right tabular">{t.passengerSeats}</Td>
              <Td>{t.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</Td>
              <Td className="text-right">
                {editable && (
                  <IconButton label={`Edit ${t.name}`} onClick={() => setEdit(t)}>
                    <Pencil className="size-4" />
                  </IconButton>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {edit && <VehicleTypeModal type={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function VehicleTypeModal({ type, onClose }: { type: VehicleType | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ code: type?.code ?? "", name: type?.name ?? "", passengerSeats: String(type?.passengerSeats ?? 4), active: type?.active ?? true, sortOrder: type?.sortOrder ?? 10 });
  const m = useMutation({
    mutationFn: () => {
      const body = { name: f.name, passengerSeats: Number(f.passengerSeats), active: f.active, sortOrder: f.sortOrder };
      return type ? api(`/admin/vehicle-types/${type.id}`, { method: "PUT", body }) : api("/admin/vehicle-types", { method: "POST", body: { ...body, code: f.code } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle-types"] });
      toast("Vehicle type saved");
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={type ? `Edit ${type.name}` : "Add a vehicle type"}
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
        {!type && <TextInput label="Code" hint="Capital letters and underscores, e.g. INNOVA" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}
        <TextInput label="Name customers see" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextInput label="Passenger seats" inputMode="numeric" value={f.passengerSeats} onChange={(e) => setF({ ...f, passengerSeats: e.target.value.replace(/\D/g, "") })} />
        <Toggle label="Active" hint="Hidden types can't be chosen for new vehicles." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        {m.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(m.error)}</p>}
      </div>
    </Modal>
  );
}

function DocumentTypes({ editable }: { editable: boolean }) {
  const q = useQuery({ queryKey: ["document-types"], queryFn: () => api<DocumentType[]>("/admin/document-types") });
  const [edit, setEdit] = useState<DocumentType | "new" | null>(null);
  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardTitle action={editable && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit("new")}>Add document</Button>}>Driver and vehicle documents</CardTitle>
        <p className="-mt-2 mb-4 text-sm text-slate-500">What drivers must upload before they can be approved (5.2, 5.3). Files are kept and never deleted automatically.</p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Document</Th>
            <Th>For</Th>
            <Th>Rule</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.data?.map((t) => (
            <tr key={t.id}>
              <Td className="font-medium">{t.label}</Td>
              <Td className="text-slate-600">{t.appliesTo === "DRIVER" ? "Driver" : "Each vehicle"}</Td>
              <Td className="text-slate-600">
                {!t.required ? "Optional" : t.requiredIfPlate ? `Required for ${t.requiredIfPlate.toLowerCase()} plates` : "Required"}
                {t.hasExpiry && " · has expiry date"}
              </Td>
              <Td>{t.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</Td>
              <Td className="text-right">
                {editable && (
                  <IconButton label={`Edit ${t.label}`} onClick={() => setEdit(t)}>
                    <Pencil className="size-4" />
                  </IconButton>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {edit && <DocumentTypeModal type={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function DocumentTypeModal({ type, onClose }: { type: DocumentType | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    code: type?.code ?? "",
    label: type?.label ?? "",
    appliesTo: type?.appliesTo ?? ("DRIVER" as DocumentType["appliesTo"]),
    required: type?.required ?? true,
    requiredIfPlate: type?.requiredIfPlate ?? ("" as "" | "YELLOW" | "WHITE"),
    hasExpiry: type?.hasExpiry ?? false,
    active: type?.active ?? true,
  });
  const m = useMutation({
    mutationFn: () => {
      const body = { label: f.label, required: f.required, requiredIfPlate: f.requiredIfPlate || null, hasExpiry: f.hasExpiry, active: f.active };
      return type ? api(`/admin/document-types/${type.id}`, { method: "PUT", body }) : api("/admin/document-types", { method: "POST", body: { ...body, code: f.code, appliesTo: f.appliesTo } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-types"] });
      toast("Document saved");
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={type ? `Edit ${type.label}` : "Add a required document"}
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
        {!type && (
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Code" hint="e.g. POLICE_VERIFICATION" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
            <SelectInput label="For" value={f.appliesTo} onChange={(e) => setF({ ...f, appliesTo: e.target.value as DocumentType["appliesTo"] })}>
              <option value="DRIVER">Driver</option>
              <option value="VEHICLE">Each vehicle</option>
            </SelectInput>
          </div>
        )}
        <TextInput label="Name drivers see" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <Toggle label="Required" checked={f.required} onChange={(v) => setF({ ...f, required: v })} />
        {f.required && (
          <SelectInput label="Required for" value={f.requiredIfPlate} onChange={(e) => setF({ ...f, requiredIfPlate: e.target.value as "" | "YELLOW" | "WHITE" })}>
            <option value="">Every driver</option>
            <option value="YELLOW">Only yellow-plate vehicles</option>
            <option value="WHITE">Only white-plate vehicles</option>
          </SelectInput>
        )}
        <Toggle label="Has an expiry date" hint="Drivers must enter the expiry date when uploading." checked={f.hasExpiry} onChange={(v) => setF({ ...f, hasExpiry: v })} />
        <Toggle label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        {m.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(m.error)}</p>}
      </div>
    </Modal>
  );
}
