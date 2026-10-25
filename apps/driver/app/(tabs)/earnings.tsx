import { Card, Empty, ErrorView, InfoRow, Row, Screen, Skeleton, T, dayLabel, inr, space, useColors } from "@primecabs/mobile-ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { api, errorMessage } from "@/lib/api";
import type { DriverRide, Earnings as EarningsT } from "@/lib/types";

export default function Earnings() {
  const c = useColors();
  const summary = useQuery({ queryKey: ["earnings"], queryFn: () => api<EarningsT>("/driver/earnings") });
  const past = useQuery({ queryKey: ["rides", "past"], queryFn: () => api<DriverRide[]>("/driver/rides", { query: { scope: "past" } }) });
  const paid = past.data?.filter((r) => r.status === "COMPLETED" && r.earnings > 0) ?? [];

  return (
    <Screen onRefresh={() => Promise.all([summary.refetch(), past.refetch()])} refreshing={summary.isRefetching}>
      {summary.isError ? (
        <ErrorView message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
      ) : (
        <Row gap={space.sm}>
          {[
            ["Last 7 days", summary.data?.last7Days],
            ["Last 30 days", summary.data?.last30Days],
          ].map(([label, v]) => (
            <Card key={label as string} style={{ flex: 1 }}>
              <T variant="small">{label}</T>
              {v === undefined ? <Skeleton height={26} width={90} style={{ marginTop: 6 }} /> : <T variant="h2" style={{ marginTop: 4 }}>{inr(v as number)}</T>}
            </Card>
          ))}
        </Row>
      )}
      {summary.data && (
        <Card>
          <InfoRow label="From confirmed bookings, not yet driven" value={inr(summary.data.upcoming)} strong />
          <InfoRow label="Seats sold, last 7 days" value={String(summary.data.seatsSoldLast7Days)} />
          <T variant="caption" style={{ marginTop: space.sm }}>
            Amounts are what you keep after GST and the PrimeCabs fee. PrimeCabs pays completed trips to your bank account or UPI.
          </T>
        </Card>
      )}

      <T variant="label">Completed trips</T>
      {past.isLoading ? (
        <Skeleton height={64} />
      ) : paid.length === 0 ? (
        <Empty icon="wallet-outline" title="No earnings yet" body="When you finish a trip, what you earned appears here." />
      ) : (
        <Card style={{ paddingVertical: space.xs }}>
          {paid.map((r, i) => (
            <Pressable key={r.id} onPress={() => router.push({ pathname: "/ride/[id]", params: { id: r.id } })} style={{ paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View>
                  <T variant="bodyStrong">
                    {r.from} → {r.to}
                  </T>
                  <T variant="small">
                    {dayLabel(r.departureAt)} · {r.seatsSold} seats
                  </T>
                </View>
                <T variant="bodyStrong" color={c.success}>
                  {inr(r.earnings)}
                </T>
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
