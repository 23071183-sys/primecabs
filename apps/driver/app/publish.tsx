// Publish a ride (or edit one with ?edit=<rideId>). The driver proposes the fare; PrimeCabs approves it.
import { Banner, Button, Card, Choice, Field, InfoRow, Row, Screen, Sheet, Skeleton, Stepper, T, duration, inr, isoToIst, paiseFromInput, space, time, useColors, useToast } from "@primecabs/mobile-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { goBack } from "@/lib/nav";
import { HOURS, MINUTES, departureFrom, hourLabel, nextDays } from "@/lib/schedule";
import type { City, DriverRide, PublicConfig, ReferenceFare, RideDetail, RouteRef } from "@/lib/types";

type Prefill = {
  routeId?: string;
  vehicleId?: string;
  departureAt?: string;
  seats?: string;
  fare?: string;
};
type Params = Prefill & { edit?: string };
type Suggestion = { routeId: string; vehicleId: string; earliestDepartureAt: string; totalSeats: number; seatFare: number };
type SaveResult = { kind: "updated" } | { kind: "created"; returnSuggestion: Suggestion | null };

function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export default function Publish() {
  const c = useColors();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<Params>();
  const { me } = useSession();
  const vehicles = me?.vehicles.filter((v) => v.status === "APPROVED") ?? [];

  const config = useQuery({ queryKey: ["config"], queryFn: () => api<PublicConfig>("/config") });
  const routes = useQuery({ queryKey: ["routes"], queryFn: () => api<RouteRef[]>("/routes") });
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/cities") });
  const editing = useQuery({ queryKey: ["ride", params.edit], queryFn: () => api<RideDetail>(`/driver/rides/${params.edit}`), enabled: !!params.edit });

  const [routeId, setRouteId] = useState<string | null>(params.routeId ?? null);
  const [vehicleId, setVehicleId] = useState<string | null>(params.vehicleId ?? (vehicles.length === 1 ? vehicles[0]!.id : null));
  const start = params.departureAt ? isoToIst(params.departureAt) : null;
  const [date, setDate] = useState<string | null>(start?.date ?? null);
  const [hour, setHour] = useState<number | null>(start ? Number(start.time.slice(0, 2)) : null);
  const [minute, setMinute] = useState<string | null>(start ? (MINUTES.find((m) => Number(m) >= Number(start.time.slice(3))) ?? "45") : null);
  const [seats, setSeats] = useState<number>(params.seats ? Number(params.seats) : 0);
  const [fare, setFare] = useState(params.fare ? String(Number(params.fare) / 100) : "");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [returnOffer, setReturnOffer] = useState<Prefill | null>(null);

  // Fill the form once when editing an existing ride.
  useEffect(() => {
    const r = editing.data;
    if (!r) return;
    const t = isoToIst(r.departureAt);
    setRouteId(r.routeId);
    setVehicleId(r.vehicleId);
    setDate(t.date);
    setHour(Number(t.time.slice(0, 2)));
    setMinute(t.time.slice(3));
    setSeats(r.totalSeats);
    setFare(String((r.seatFare ?? r.proposedSeatFare) / 100));
    setNotes(r.notes ?? "");
  }, [editing.data]);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const capacity = vehicle?.type.passengerSeats ?? 0;
  useEffect(() => {
    if (capacity && (seats === 0 || seats > capacity)) setSeats(capacity);
  }, [capacity, seats]);

  const cityName = (id: string) => cities.data?.find((x) => x.id === id)?.name ?? "…";
  const route = routes.data?.find((r) => r.id === routeId);
  const days = useMemo(() => nextDays(Math.min(config.data?.bookingHorizonDays ?? 30, 30)), [config.data?.bookingHorizonDays]);
  const farePaise = paiseFromInput(fare);
  const debouncedFare = useDebounced(farePaise);

  const ref = useQuery({
    queryKey: ["reference-fare", routeId, vehicleId, debouncedFare],
    queryFn: () => api<ReferenceFare>("/driver/reference-fare", { query: { routeId, vehicleId, seatFare: debouncedFare } }),
    enabled: !!routeId && !!vehicleId,
    placeholderData: (p) => p,
  });

  const dep = date ? departureFrom(date, hour, minute, new Date(), config.data?.bookingCutoffMinutes ?? 15) : { error: "Choose a date" };
  const errors = {
    route: !routeId ? "Choose your route" : undefined,
    vehicle: !vehicleId ? "Choose a vehicle" : undefined,
    when: "error" in dep ? dep.error : undefined,
    fare: !farePaise || farePaise < 5_000 ? "Enter a fare per seat of at least ₹50" : farePaise > 10_000_00 ? "That fare looks too high" : undefined,
  };
  const ok = !Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: async (): Promise<SaveResult> => {
      const departureAt = "iso" in dep ? dep.iso : "";
      if (params.edit) {
        await api<DriverRide>(`/driver/rides/${params.edit}`, { method: "PUT", body: { departureAt, totalSeats: seats, seatFare: farePaise, notes: notes.trim() || undefined } });
        return { kind: "updated" };
      }
      const r = await api<{ ride: DriverRide; returnSuggestion: Suggestion | null }>("/driver/rides", {
        method: "POST",
        body: { routeId, vehicleId, departureAt, totalSeats: seats, seatFare: farePaise, notes: notes.trim() || undefined },
      });
      return { kind: "created", returnSuggestion: r.returnSuggestion };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["rides"] });
      if (r.kind === "updated") {
        qc.invalidateQueries({ queryKey: ["ride", params.edit] });
        toast("Ride updated. A fare change goes back for review.");
        goBack("/(tabs)");
        return;
      }
      toast("Ride sent to PrimeCabs for fare approval");
      const s = r.returnSuggestion;
      if (s) setReturnOffer({ routeId: s.routeId, vehicleId: s.vehicleId, departureAt: s.earliestDepartureAt, seats: String(s.totalSeats), fare: String(s.seatFare) });
      else goBack("/(tabs)");
    },
  });
  const apiErr = save.error instanceof ApiError ? save.error : null;
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  if (!me || routes.isLoading || cities.isLoading || (params.edit && editing.isLoading)) {
    return (
      <Screen>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={64} />
        ))}
      </Screen>
    );
  }
  if (vehicles.length === 0) {
    return (
      <Screen>
        <Banner tone="warning" title="No approved vehicle" body="You can publish once PrimeCabs approves your vehicle." />
      </Screen>
    );
  }

  const arrival = "iso" in dep && route ? new Date(new Date(dep.iso).getTime() + route.durationMinutes * 60_000) : null;
  const est = ref.data?.perSeat;

  return (
    <>
      <Screen
        footer={
          <Button
            title={params.edit ? "Save changes" : "Send for approval"}
            icon="paper-plane"
            loading={save.isPending}
            onPress={() => {
              setTouched(true);
              if (ok) save.mutate();
            }}
          />
        }
      >
        {params.edit ? (
          <Choice label="Route" value={routeId} onChange={() => {}} options={route ? [{ value: route.id, label: `${cityName(route.fromCityId)} → ${cityName(route.toCityId)}` }] : []} />
        ) : (
          <Choice
            label="Route"
            value={routeId}
            onChange={setRouteId}
            error={show("route")}
            options={(routes.data ?? []).map((r) => ({ value: r.id, label: `${cityName(r.fromCityId)} → ${cityName(r.toCityId)}`, hint: `${r.distanceKm} km · ${duration(r.durationMinutes)}` }))}
          />
        )}

        {vehicles.length > 1 && !params.edit && (
          <Choice
            label="Vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            error={show("vehicle")}
            options={vehicles.map((v) => ({ value: v.id, label: `${v.make} ${v.model}`, hint: v.registrationNo }))}
          />
        )}

        <View style={{ gap: 6 }}>
          <T variant="small" style={{ fontWeight: "600" }}>
            Date
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {days.map((d) => {
              const on = d.date === date;
              return (
                <Pressable
                  key={d.date}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${d.weekday} ${d.day} ${d.month}`}
                  onPress={() => setDate(d.date)}
                  style={{ width: 62, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: on ? c.header : c.card, borderWidth: 1, borderColor: on ? c.header : c.borderStrong }}
                >
                  <T variant="caption" color={on ? "rgba(255,255,255,0.8)" : c.textSecondary}>
                    {d.weekday}
                  </T>
                  <T variant="title" color={on ? "#FFFFFF" : c.text}>
                    {d.day}
                  </T>
                  <T variant="caption" color={on ? "rgba(255,255,255,0.8)" : c.textMuted}>
                    {d.month}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ gap: 6 }}>
          <T variant="small" style={{ fontWeight: "600" }}>
            Departure time
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {HOURS.map((h) => {
              const on = h === hour;
              return (
                <Pressable
                  key={h}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => (setHour(h), minute === null && setMinute("00"))}
                  style={{ width: "23%", height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.primarySoft : c.card, borderWidth: on ? 1.5 : 1, borderColor: on ? c.primary : c.border }}
                >
                  <T variant={on ? "bodyStrong" : "body"}>{hourLabel(h)}</T>
                </Pressable>
              );
            })}
          </View>
          <Choice value={minute} onChange={setMinute} options={MINUTES.map((m) => ({ value: m, label: `:${m}` }))} />
          {show("when") ? (
            <T variant="small" color={c.danger}>
              {errors.when}
            </T>
          ) : arrival && "iso" in dep ? (
            <T variant="small">
              Leaves {time(dep.iso)}, arrives about {time(arrival)}
            </T>
          ) : null}
        </View>

        {vehicle && <Stepper label="Seats for passengers" value={seats} min={1} max={capacity} onChange={setSeats} hint={`Your ${vehicle.model} can take up to ${capacity}.`} />}

        <Field
          label="Fare per seat"
          prefix="₹"
          keyboardType="decimal-pad"
          value={fare}
          onChangeText={(t) => setFare(t.replace(/[^\d.]/g, ""))}
          placeholder={ref.data?.referenceSeatFare ? String(ref.data.referenceSeatFare / 100) : "550"}
          error={show("fare")}
          hint={ref.data?.referenceSeatFare ? `PrimeCabs reference for this route: ${inr(ref.data.referenceSeatFare)}. Fares near it are approved faster.` : "PrimeCabs reviews every fare before customers see the ride."}
        />

        {est && farePaise && (
          <Card>
            <T variant="label" style={{ marginBottom: space.xs }}>
              Per seat
            </T>
            <InfoRow label="Customer pays (GST included)" value={inr(est.customerPays)} />
            <InfoRow label="GST" value={`− ${inr(est.gst)}`} />
            <InfoRow label={`PrimeCabs fee (${est.commissionPercent}%)`} value={`− ${inr(est.commission)}`} />
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
            <InfoRow label="You get" value={<T variant="title" color={c.success}>{inr(est.driverEarns)}</T>} />
            <Row style={{ justifyContent: "space-between", marginTop: 2 }}>
              <T variant="small">If all {seats} seats sell, about</T>
              <T variant="bodyStrong">{inr(est.driverEarns * seats)}</T>
            </Row>
          </Card>
        )}

        <Field label="Note for passengers (optional)" value={notes} onChangeText={setNotes} placeholder="For example: AC car, one bag per person" maxLength={300} multiline />
        {apiErr && <Banner tone="danger" body={apiErr.message} />}
        {save.isError && !apiErr && <Banner tone="danger" body={errorMessage(save.error)} />}
      </Screen>

      <Sheet
        visible={!!returnOffer}
        onClose={() => (setReturnOffer(null), goBack("/(tabs)"))}
        title="Publish the return trip?"
        footer={
          <>
            <Button
              title="Yes, set up return trip"
              icon="swap-horizontal"
              onPress={() => {
                const p = returnOffer!;
                setReturnOffer(null);
                router.replace({ pathname: "/publish", params: { routeId: p.routeId!, vehicleId: p.vehicleId!, departureAt: p.departureAt!, seats: p.seats!, fare: p.fare! } });
              }}
            />
            <Button title="Not now" kind="ghost" onPress={() => (setReturnOffer(null), goBack("/(tabs)"))} />
          </>
        }
      >
        <T variant="body">
          Fill your car on the way back too. We'll copy the details and reverse the route; pick the time you'll leave.
        </T>
      </Sheet>
    </>
  );
}
