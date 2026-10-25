// One ride: status, fare, passengers, and trip day (board and drop each passenger with their code).
import { Banner, Button, Card, Chip, CodeInput, Empty, ErrorView, Field, Icon, IconButton, InfoRow, Row, Screen, SeatBar, Sheet, Skeleton, T, dateTime, inr, phone, space, time, useColors, useToast } from "@primecabs/mobile-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { rideStatus } from "@/components/RideCard";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { RideDetail } from "@/lib/types";

const BOARDING_OPENS_MIN = 120;
type Passenger = RideDetail["passengers"][number];

export default function RideScreen() {
  const c = useColors();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["ride", id], queryFn: () => api<RideDetail>(`/driver/rides/${id}`), refetchInterval: 30_000 });
  // The sheet keeps showing its passenger while it slides closed, so `codeFor` is cleared only on open.
  const [codeFor, setCodeFor] = useState<{ p: Passenger; purpose: "start" | "end" } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ride", id] });
    qc.invalidateQueries({ queryKey: ["rides"] });
    qc.invalidateQueries({ queryKey: ["earnings"] });
  };

  const useCode = useMutation({
    mutationFn: ({ p, purpose, otp }: { p: Passenger; purpose: "start" | "end"; otp: string }) =>
      api<{ status: string; rideCompleted?: boolean }>(`/driver/rides/${id}/passengers/${p.id}/${purpose}`, { body: { otp } }),
    onSuccess: (r, v) => {
      setCodeOpen(false);
      refresh();
      toast(r.rideCompleted ? "Trip complete. Well done!" : v.purpose === "start" ? `${v.p.name} is on board` : `${v.p.name} dropped`);
    },
    onError: (e) => {
      setCode("");
      setCodeError(errorMessage(e));
    },
  });
  const noShow = useMutation({
    mutationFn: (p: Passenger) => api<{ rideCompleted: boolean }>(`/driver/rides/${id}/passengers/${p.id}/no-show`, { body: {} }),
    onSuccess: (_r, p) => (refresh(), toast(`${p.name} marked as no-show`)),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const complete = useMutation({
    mutationFn: () => api(`/driver/rides/${id}/complete`, { body: {} }),
    onSuccess: () => (refresh(), toast("Trip complete")),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const cancel = useMutation({
    mutationFn: () => api<{ bookingsCancelled: number }>(`/driver/rides/${id}/cancel`, { body: { reason: reason.trim() } }),
    onSuccess: (r) => {
      setCancelOpen(false);
      refresh();
      toast(r.bookingsCancelled ? `Ride cancelled. ${r.bookingsCancelled} booking(s) refunded in full.` : "Ride cancelled");
    },
  });

  if (q.isLoading) {
    return (
      <Screen>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={100} style={{ borderRadius: 14 }} />
        ))}
      </Screen>
    );
  }
  if (q.isError || !q.data) return <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const r = q.data;
  const s = rideStatus[r.status];
  const now = Date.now();
  const departure = new Date(r.departureAt).getTime();
  const boardingOpen = now >= departure - BOARDING_OPENS_MIN * 60_000;
  const departed = now >= departure;
  const active = ["OPEN", "FULL", "STARTED"].includes(r.status);
  const onboard = r.passengers.filter((p) => p.status === "ONBOARD").length;
  const handled = r.passengers.filter((p) => p.status === "DROPPED" || p.status === "NO_SHOW").length;
  const editable = ["PENDING_APPROVAL", "REJECTED", "OPEN"].includes(r.status) && r.passengers.length === 0;
  const cancellable = ["PENDING_APPROVAL", "REJECTED", "OPEN", "FULL"].includes(r.status);
  const canEnd = active && departed && r.passengers.every((p) => p.status === "DROPPED" || p.status === "NO_SHOW");

  const openCode = (p: Passenger, purpose: "start" | "end") => {
    setCode("");
    setCodeError(null);
    setCodeFor({ p, purpose });
    setCodeOpen(true);
  };

  return (
    <>
      <Stack.Screen options={{ title: `${r.from} → ${r.to}` }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
        <Card>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ gap: 2, flex: 1 }}>
              <T variant="title">{dateTime(r.departureAt)}</T>
              <T variant="small">
                Arrives about {time(r.arrivalAt)} · {r.vehicle.type.replace(" or similar 7-seater", "")} {r.vehicle.registrationNo}
              </T>
            </View>
            <Chip label={s.label} tone={s.tone} />
          </Row>
          <View style={{ marginTop: space.lg, gap: 6 }}>
            <SeatBar sold={r.totalSeats - r.availableSeats} total={r.totalSeats} />
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="small">
                {r.totalSeats - r.availableSeats} of {r.totalSeats} seats booked
              </T>
              <T variant="small">{inr(r.seatFare ?? r.proposedSeatFare)} / seat</T>
            </Row>
          </View>
          {r.earnings > 0 && <InfoRow label="You earn from these bookings" value={<T variant="bodyStrong" color={c.success}>{inr(r.earnings)}</T>} />}
        </Card>

        {r.status === "PENDING_APPROVAL" && <Banner tone="warning" title="Waiting for fare approval" body={`PrimeCabs is reviewing your fare of ${inr(r.proposedSeatFare)} per seat. Customers can book once it's approved.`} />}
        {r.status === "REJECTED" && <Banner tone="danger" title="Not approved" body={`${r.fareDecision?.reason ?? "PrimeCabs didn't approve this ride."} Edit the ride to send it again.`} />}
        {r.status === "OPEN" && r.fareDecision?.decision === "CHANGED" && r.fareDecision.approvedFare && (
          <Banner tone="info" title="Fare changed by PrimeCabs" body={`You proposed ${inr(r.proposedSeatFare)}; it was approved at ${inr(r.fareDecision.approvedFare)} per seat. Cancel the ride if that doesn't work for you.`} />
        )}
        {r.status === "CANCELLED" && <Banner tone="danger" title="Cancelled" body={r.cancelReason ?? "This ride was cancelled."} />}

        {active && r.passengers.length > 0 && (
          <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primary }}>
            <Row gap={space.md}>
              <Icon name="people" size={22} color={c.accentText} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">
                  {onboard} on board · {handled} done · {r.passengers.length - onboard - handled} waiting
                </T>
                <T variant="small">{boardingOpen ? "Ask each passenger for the 4-digit code on their ticket." : `Boarding opens ${BOARDING_OPENS_MIN / 60} hours before departure.`}</T>
              </View>
            </Row>
          </Card>
        )}

        <T variant="label">Passengers</T>
        {r.passengers.length === 0 ? (
          <Card>
            <Empty icon="people-outline" title="No bookings yet" body={r.status === "OPEN" ? "Customers can book now. Bookings appear here as they come in." : undefined} />
          </Card>
        ) : (
          r.passengers.map((p) => (
            <Card key={p.id} highlight={p.status === "BOOKED" && boardingOpen && active}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong">{p.name}</T>
                  <T variant="small">
                    {p.gender === "FEMALE" ? "F" : p.gender === "MALE" ? "M" : "O"} · {p.age} · {p.bookingCode}
                  </T>
                </View>
                <Chip
                  label={{ BOOKED: "Waiting", ONBOARD: "On board", DROPPED: "Dropped", NO_SHOW: "No-show" }[p.status]}
                  tone={{ BOOKED: "neutral", ONBOARD: "info", DROPPED: "success", NO_SHOW: "danger" }[p.status] as "neutral"}
                />
                <IconButton name="call" label={`Call ${p.name}`} color={c.accentText} onPress={() => Linking.openURL(`tel:${p.phone}`)} />
              </Row>
              <View style={{ marginTop: space.sm, gap: 2 }}>
                {p.pickup && <T variant="small">Pickup: {p.pickup}</T>}
                {p.drop && <T variant="small">Drop: {p.drop}</T>}
                <T variant="caption">{phone(p.phone)}</T>
              </View>
              {active && p.status === "BOOKED" && boardingOpen && (
                <View style={{ marginTop: space.md, gap: space.sm }}>
                  <Button title="Board with code" icon="log-in-outline" size="md" onPress={() => openCode(p, "start")} />
                  {departed && <Button title="Mark as no-show" kind="secondary" size="md" loading={noShow.isPending && noShow.variables?.id === p.id} onPress={() => noShow.mutate(p)} />}
                </View>
              )}
              {active && p.status === "ONBOARD" && (
                <View style={{ marginTop: space.md }}>
                  <Button title="Drop with code" icon="flag-outline" size="md" onPress={() => openCode(p, "end")} />
                </View>
              )}
            </Card>
          ))
        )}

        {canEnd && <Button title="End trip" icon="checkmark-done" loading={complete.isPending} onPress={() => complete.mutate()} />}
        {editable && <Button title="Edit ride" kind="secondary" icon="create-outline" onPress={() => router.push({ pathname: "/publish", params: { edit: r.id } })} />}
        {cancellable && <Button title="Cancel ride" kind="danger" icon="close-circle-outline" onPress={() => (setReason(""), setCancelOpen(true))} />}
      </Screen>

      <Sheet
        visible={codeOpen}
        onClose={() => setCodeOpen(false)}
        title={codeFor ? `${codeFor.purpose === "start" ? "Board" : "Drop"} ${codeFor.p.name}` : ""}
        footer={
          <Button
            title={codeFor?.purpose === "start" ? "Confirm boarding" : "Confirm drop"}
            disabled={code.length !== 4}
            loading={useCode.isPending}
            onPress={() => codeFor && useCode.mutate({ ...codeFor, otp: code })}
          />
        }
      >
        <T variant="body">Ask {codeFor?.p.name.split(" ")[0]} for the {codeFor?.purpose === "start" ? "boarding" : "drop"} code on their e-ticket.</T>
        <CodeInput label="Trip code" length={4} value={code} onChange={(v) => (setCode(v), setCodeError(null))} autoFocus error={!!codeError} />
        {codeError && (
          <T variant="small" color={c.danger} accessibilityRole="alert" style={{ textAlign: "center" }}>
            {codeError}
          </T>
        )}
      </Sheet>

      <Sheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this ride?"
        footer={
          <>
            <Button title="Cancel ride" kind="danger" loading={cancel.isPending} disabled={reason.trim().length < 3} onPress={() => cancel.mutate()} />
            <Button title="Keep ride" kind="ghost" onPress={() => setCancelOpen(false)} />
          </>
        }
      >
        {r.passengers.length > 0 ? (
          <Banner tone="warning" body={`${r.passengers.length} passenger(s) have booked. They'll be refunded in full and told the ride is cancelled. Repeated cancellations can lead to a fine.`} />
        ) : (
          <T variant="body">No one has booked yet.</T>
        )}
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="For example: car needs repair" maxLength={300} multiline />
        {cancel.error instanceof ApiError && <Banner tone="danger" body={cancel.error.message} />}
      </Sheet>
    </>
  );
}
