import { Card, Chip, Icon, Row, SeatBar, T, dateTime, inr, space, time, useColors, type Tone } from "@primecabs/mobile-ui";
import { router } from "expo-router";
import { View } from "react-native";
import type { DriverRide, RideStatus } from "@/lib/types";

export const rideStatus: Record<RideStatus, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Fare in review", tone: "warning" },
  REJECTED: { label: "Not approved", tone: "danger" },
  OPEN: { label: "Live", tone: "success" },
  FULL: { label: "Full", tone: "info" },
  STARTED: { label: "On trip", tone: "info" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export function RideCard({ ride }: { ride: DriverRide }) {
  const c = useColors();
  const s = rideStatus[ride.status];
  const fare = ride.seatFare ?? ride.proposedSeatFare;
  return (
    <Card onPress={() => router.push({ pathname: "/ride/[id]", params: { id: ride.id } })}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <T variant="bodyStrong">{ride.from}</T>
            <Icon name="arrow-forward" size={16} color={c.textMuted} />
            <T variant="bodyStrong">{ride.to}</T>
          </Row>
          <T variant="small">
            {dateTime(ride.departureAt)} – {time(ride.arrivalAt)} · {ride.vehicle.type.replace(" or similar 7-seater", "")}
          </T>
        </View>
        <Chip label={s.label} tone={s.tone} />
      </Row>
      {ride.status === "REJECTED" && ride.fareDecision?.reason && (
        <T variant="small" color={c.danger} style={{ marginTop: space.sm }}>
          {ride.fareDecision.reason}
        </T>
      )}
      {ride.status !== "CANCELLED" && ride.status !== "REJECTED" && (
        <View style={{ marginTop: space.md, gap: 6 }}>
          <SeatBar sold={ride.seatsSold} total={ride.totalSeats} />
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="small">
              {ride.seatsSold} of {ride.totalSeats} booked
            </T>
            <T variant="small">
              {inr(fare)} / seat{ride.status === "PENDING_APPROVAL" ? " proposed" : ""}
            </T>
          </Row>
        </View>
      )}
    </Card>
  );
}
