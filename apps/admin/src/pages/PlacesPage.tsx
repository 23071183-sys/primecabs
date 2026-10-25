import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Home, MapPin, Pencil, Plus, Route as RouteIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardTitle, EmptyState, ErrorState, PageHeader, Skeleton, Table, Td, Th } from "@/components/ui/Data";
import { SelectInput, TextInput, Toggle } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { inrFromPaise, paiseFromRupees, rupeesFromPaise } from "@/lib/format";
import type { City, PickupPoint, Route, VehicleType } from "@/lib/types";

const KIND_LABEL: Record<PickupPoint["kind"], string> = { RAILWAY: "Railway station", BUS_STAND: "Bus stand", AIRPORT: "Airport", OTHER: "Other" };

function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method, path, body }: { method: "POST" | "PUT"; path: string; body: unknown }) => api(path, { method, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cities"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

export function PlacesPage() {
  const { can } = useAuth();
  const edit = can("config.write");
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/admin/cities") });
  const routes = useQuery({ queryKey: ["routes"], queryFn: () => api<Route[]>("/admin/routes") });
  const types = useQuery({ queryKey: ["vehicle-types"], queryFn: () => api<VehicleType[]>("/admin/vehicle-types") });

  const [cityModal, setCityModal] = useState<City | "new" | null>(null);
  const [pointModal, setPointModal] = useState<{ city: City; point?: PickupPoint } | null>(null);
  const [routeModal, setRouteModal] = useState<Route | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Cities and routes"
        description="Hubs use fixed pickup points. Spoke towns can also offer home pickup. Deactivating hides a place from search but keeps its history."
        actions={
          edit && (
            <>
              <Button icon={<Plus className="size-4" />} onClick={() => setCityModal("new")}>
                Add city
              </Button>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setRouteModal("new")}>
                Add route
              </Button>
            </>
          )
        }
      />

      {cities.isError ? (
        <Card>
          <ErrorState message={errorMessage(cities.error)} onRetry={() => cities.refetch()} />
        </Card>
      ) : !cities.data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cities.data.map((c) => (
            <Card key={c.id} className={c.active ? "" : "opacity-60"}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{c.name}</h3>
                    <Badge tone={c.type === "HUB" ? "navy" : "gray"}>{c.type === "HUB" ? "Hub" : "Spoke"}</Badge>
                    {!c.active && <Badge tone="red">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.state}
                    {c.hubCityId && ` · served from ${cities.data.find((h) => h.id === c.hubCityId)?.name ?? "hub"}`}
                  </p>
                </div>
                {edit && (
                  <IconButton label={`Edit ${c.name}`} onClick={() => setCityModal(c)}>
                    <Pencil className="size-4" />
                  </IconButton>
                )}
              </div>
              {c.type === "SPOKE" && (
                <p className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Home className="size-3.5" />
                  {c.homePickupAllowed ? `Home pickup within ${c.homePickupRadiusKm} km · ${c.homePickupFee ? `+${inrFromPaise(c.homePickupFee)}` : "free"}` : "No home pickup"}
                </p>
              )}
              <ul className="space-y-1.5">
                {c.pickupPoints.length === 0 && <li className="text-sm text-slate-500">No pickup points yet.</li>}
                {c.pickupPoints.map((p) => (
                  <li key={p.id} className={`flex items-center gap-2 text-sm ${p.active ? "" : "opacity-50"}`}>
                    <MapPin className="size-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-slate-800" title={p.name}>
                      {p.name}
                    </span>
                    <span className="text-xs text-slate-500">{p.extraFare ? `+${inrFromPaise(p.extraFare)}` : "Free"}</span>
                    {edit && (
                      <button onClick={() => setPointModal({ city: c, point: p })} className="text-xs font-medium text-teal-700 hover:underline">
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {edit && (
                <Button size="sm" variant="ghost" className="mt-3 -ml-2" icon={<Plus className="size-4" />} onClick={() => setPointModal({ city: c })}>
                  Add pickup point
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6" padded={false}>
        <div className="px-5 pt-5">
          <CardTitle>Routes and reference fares</CardTitle>
          <p className="-mt-2 mb-4 text-sm text-slate-500">The reference fare per seat is shown next to a driver's proposed fare when you review rides.</p>
        </div>
        {!routes.data || !types.data ? (
          <div className="space-y-2 px-5 pb-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : routes.data.length === 0 ? (
          <EmptyState icon={<RouteIcon className="size-5" />} title="No routes yet" body="Add a route between a hub and a spoke town." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Route</Th>
                <Th className="text-right">Distance</Th>
                <Th className="text-right">Time</Th>
                {types.data.filter((t) => t.active).map((t) => (
                  <Th key={t.id} className="text-right">
                    {t.name.replace(" or similar 7-seater", "")}
                  </Th>
                ))}
                <Th />
              </tr>
            </thead>
            <tbody>
              {routes.data.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                  <Td className="font-medium text-slate-900">
                    <span className="flex items-center gap-1.5">
                      {r.fromCity.name} <ArrowRight className="size-3.5 text-slate-400" /> {r.toCity.name}
                      {!r.active && <Badge tone="red">Inactive</Badge>}
                    </span>
                  </Td>
                  <Td className="text-right tabular text-slate-600">{r.distanceKm} km</Td>
                  <Td className="text-right tabular text-slate-600">
                    {Math.floor(r.durationMinutes / 60)}h {String(r.durationMinutes % 60).padStart(2, "0")}m
                  </Td>
                  {types.data.filter((t) => t.active).map((t) => (
                    <Td key={t.id} className="text-right tabular text-slate-700">
                      {inrFromPaise(r.fares.find((f) => f.vehicleTypeId === t.id)?.referenceSeatFare)}
                    </Td>
                  ))}
                  <Td className="text-right">
                    {edit && (
                      <IconButton label={`Edit ${r.fromCity.name} to ${r.toCity.name}`} onClick={() => setRouteModal(r)}>
                        <Pencil className="size-4" />
                      </IconButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {cityModal && <CityModal city={cityModal === "new" ? null : cityModal} hubs={(cities.data ?? []).filter((c) => c.type === "HUB")} onClose={() => setCityModal(null)} />}
      {pointModal && <PointModal city={pointModal.city} point={pointModal.point} onClose={() => setPointModal(null)} />}
      {routeModal && cities.data && types.data && (
        <RouteModal route={routeModal === "new" ? null : routeModal} cities={cities.data} types={types.data.filter((t) => t.active)} onClose={() => setRouteModal(null)} />
      )}
    </>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {errorMessage(error)}
    </p>
  );
}

function CityModal({ city, hubs, onClose }: { city: City | null; hubs: City[]; onClose: () => void }) {
  const save = useSave();
  const toast = useToast();
  const [f, setF] = useState({
    name: city?.name ?? "",
    state: city?.state ?? "Madhya Pradesh",
    type: city?.type ?? ("SPOKE" as City["type"]),
    hubCityId: city?.hubCityId ?? hubs[0]?.id ?? "",
    homePickupAllowed: city?.homePickupAllowed ?? true,
    homePickupFee: city ? rupeesFromPaise(city.homePickupFee) : "0",
    homePickupRadiusKm: String(city?.homePickupRadiusKm ?? 10),
    active: city?.active ?? true,
  });
  const fee = paiseFromRupees(f.homePickupFee);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (fee === null) return;
    const spoke = f.type === "SPOKE";
    const body = {
      name: f.name,
      state: f.state,
      type: f.type,
      hubCityId: spoke ? f.hubCityId || null : null,
      homePickupAllowed: spoke && f.homePickupAllowed,
      homePickupFee: spoke ? fee : 0,
      homePickupRadiusKm: Number(f.homePickupRadiusKm) || 0,
      active: f.active,
    };
    await save.mutateAsync(city ? { method: "PUT", path: `/admin/cities/${city.id}`, body } : { method: "POST", path: "/admin/cities", body });
    toast(city ? "City saved" : "City added");
    onClose();
  };
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      onClose={onClose}
      title={city ? `Edit ${city.name}` : "Add a city"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="city-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="city-form" onSubmit={(e) => submit(e).catch(() => {})} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err?.field("name")} required />
          <TextInput label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} error={err?.field("state")} required />
        </div>
        <SelectInput label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as City["type"] })}>
          <option value="HUB">Hub: big city, fixed pickup points only</option>
          <option value="SPOKE">Spoke: smaller town</option>
        </SelectInput>
        {f.type === "SPOKE" && (
          <>
            <SelectInput label="Served from hub" value={f.hubCityId} onChange={(e) => setF({ ...f, hubCityId: e.target.value })}>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </SelectInput>
            <Toggle label="Offer home pickup and drop" checked={f.homePickupAllowed} onChange={(v) => setF({ ...f, homePickupAllowed: v })} />
            {f.homePickupAllowed && (
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Home pickup fee" prefix="₹" inputMode="decimal" value={f.homePickupFee} onChange={(e) => setF({ ...f, homePickupFee: e.target.value })} error={fee === null ? "Enter an amount" : undefined} />
                <TextInput label="Up to" suffix="km" inputMode="numeric" value={f.homePickupRadiusKm} onChange={(e) => setF({ ...f, homePickupRadiusKm: e.target.value.replace(/\D/g, "") })} />
              </div>
            )}
          </>
        )}
        {city && <Toggle label="Active" hint="Inactive cities don't appear in the apps." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        <FormError error={save.error} />
      </form>
    </Modal>
  );
}

function PointModal({ city, point, onClose }: { city: City; point?: PickupPoint; onClose: () => void }) {
  const save = useSave();
  const toast = useToast();
  const [f, setF] = useState({ name: point?.name ?? "", kind: point?.kind ?? ("BUS_STAND" as PickupPoint["kind"]), extraFare: point ? rupeesFromPaise(point.extraFare) : "0", active: point?.active ?? true });
  const extra = paiseFromRupees(f.extraFare);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (extra === null) return;
    const body = { name: f.name, kind: f.kind, extraFare: extra, active: f.active };
    await save.mutateAsync(point ? { method: "PUT", path: `/admin/pickup-points/${point.id}`, body } : { method: "POST", path: "/admin/pickup-points", body: { ...body, cityId: city.id } });
    toast("Pickup point saved");
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={point ? `Edit pickup point` : `Add a pickup point in ${city.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="point-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="point-form" onSubmit={(e) => submit(e).catch(() => {})} className="space-y-4">
        <TextInput label="Name" placeholder="Ganeshpeth Bus Stand" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <div className="grid grid-cols-2 gap-3">
          <SelectInput label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PickupPoint["kind"] })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>
          <TextInput label="Extra charge" prefix="₹" inputMode="decimal" hint="0 for a free point" value={f.extraFare} onChange={(e) => setF({ ...f, extraFare: e.target.value })} error={extra === null ? "Enter an amount" : undefined} />
        </div>
        {point && <Toggle label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        <FormError error={save.error} />
      </form>
    </Modal>
  );
}

function RouteModal({ route, cities, types, onClose }: { route: Route | null; cities: City[]; types: VehicleType[]; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useSave();
  const toast = useToast();
  const [f, setF] = useState({
    fromCityId: route?.fromCityId ?? cities.find((c) => c.type === "HUB")?.id ?? "",
    toCityId: route?.toCityId ?? cities.find((c) => c.type === "SPOKE")?.id ?? "",
    distanceKm: String(route?.distanceKm ?? ""),
    hours: String(route ? Math.floor(route.durationMinutes / 60) : 3),
    minutes: String(route ? route.durationMinutes % 60 : 0),
    active: route?.active ?? true,
  });
  const [fares, setFares] = useState<Record<string, string>>(() =>
    Object.fromEntries(types.map((t) => [t.id, route?.fares.find((x) => x.vehicleTypeId === t.id) ? rupeesFromPaise(route.fares.find((x) => x.vehicleTypeId === t.id)!.referenceSeatFare) : ""])),
  );
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const durationMinutes = Number(f.hours) * 60 + Number(f.minutes);
      const base = { distanceKm: Number(f.distanceKm), durationMinutes, active: f.active };
      let routeIds: string[];
      if (route) {
        await save.mutateAsync({ method: "PUT", path: `/admin/routes/${route.id}`, body: base });
        routeIds = [route.id];
      } else {
        const created = (await api<Route[]>("/admin/routes", { method: "POST", body: { ...base, fromCityId: f.fromCityId, toCityId: f.toCityId, createReverse: true } })).map((r) => r.id);
        routeIds = created;
      }
      for (const [vehicleTypeId, v] of Object.entries(fares)) {
        const p = paiseFromRupees(v);
        if (!p) continue;
        for (const routeId of routeIds) await api("/admin/route-fares", { method: "PUT", body: { routeId, vehicleTypeId, referenceSeatFare: p } });
      }
      await qc.invalidateQueries({ queryKey: ["routes"] });
      toast(route ? "Route saved" : "Route added in both directions");
      onClose();
    } catch (err) {
      setError(err);
    }
  };

  const sameCity = f.fromCityId === f.toCityId;
  return (
    <Modal
      open
      onClose={onClose}
      title={route ? `${route.fromCity.name} → ${route.toCity.name}` : "Add a route"}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="route-form" loading={save.isPending} disabled={!route && sameCity}>
            Save
          </Button>
        </>
      }
    >
      <form id="route-form" onSubmit={submit} className="space-y-5">
        {!route && (
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="From" value={f.fromCityId} onChange={(e) => setF({ ...f, fromCityId: e.target.value })}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="To" value={f.toCityId} onChange={(e) => setF({ ...f, toCityId: e.target.value })} error={sameCity ? "Choose a different city" : undefined}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Distance" suffix="km" inputMode="numeric" value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value.replace(/\D/g, "") })} required />
          <TextInput label="Travel time" suffix="hours" inputMode="numeric" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value.replace(/\D/g, "") })} />
          <TextInput label="and minutes" suffix="min" inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-slate-700">Reference fare per seat{route ? "" : " (both directions)"}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.map((t) => (
              <TextInput key={t.id} label={t.name} prefix="₹" inputMode="decimal" value={fares[t.id] ?? ""} onChange={(e) => setFares({ ...fares, [t.id]: e.target.value })} />
            ))}
          </div>
        </div>
        {route && <Toggle label="Active" hint="Inactive routes don't appear in search." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        <FormError error={error ?? save.error} />
      </form>
    </Modal>
  );
}
