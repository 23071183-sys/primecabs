import { Banner, Button, Chip, Empty, ErrorView, Row, Screen, Skeleton, T, brand, inr, space, useColors } from "@primecabs/mobile-ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RideCard } from "@/components/RideCard";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { DriverRide, Earnings } from "@/lib/types";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const rides = useQuery({ queryKey: ["rides", "upcoming"], queryFn: () => api<DriverRide[]>("/driver/rides", { query: { scope: "upcoming" } }) });
  const earnings = useQuery({ queryKey: ["earnings"], queryFn: () => api<Earnings>("/driver/earnings") });
  const approvedVehicles = me?.vehicles.filter((v) => v.status === "APPROVED") ?? [];
  const refresh = () => Promise.all([rides.refetch(), earnings.refetch()]);
  const active = rides.data?.filter((r) => r.status !== "CANCELLED") ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: brand.navy, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.xl }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <T variant="small" color="rgba(255,255,255,0.75)">
              {greeting()},
            </T>
            <T variant="h2" color="#FFFFFF">
              {me?.name?.split(" ")[0] ?? "Driver"}
            </T>
          </View>
          <Chip label="Verified" tone="success" icon="shield-checkmark" />
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          {[
            ["Earned, last 7 days", earnings.data ? inr(earnings.data.last7Days) : null],
            ["From upcoming bookings", earnings.data ? inr(earnings.data.upcoming) : null],
          ].map(([label, value]) => (
            <View key={label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 14, padding: space.md }}>
              <T variant="caption" color="rgba(255,255,255,0.7)">
                {label}
              </T>
              {value ? (
                <T variant="title" color="#FFFFFF" style={{ marginTop: 2 }}>
                  {value}
                </T>
              ) : (
                <Skeleton height={22} width={80} style={{ marginTop: 4, opacity: 0.3 }} />
              )}
            </View>
          ))}
        </Row>
      </View>

      <Screen onRefresh={refresh} refreshing={rides.isRefetching}>
        {approvedVehicles.length === 0 ? (
          <Banner tone="warning" title="No approved vehicle" body="Your vehicle is waiting for review. You can publish rides once it's approved." />
        ) : (
          <Button title="Publish a ride" icon="add-circle" onPress={() => router.push("/publish")} />
        )}

        <T variant="label">Upcoming</T>
        {rides.isLoading ? (
          [0, 1].map((i) => <Skeleton key={i} height={120} style={{ borderRadius: 14 }} />)
        ) : rides.isError ? (
          <ErrorView message={errorMessage(rides.error)} onRetry={() => rides.refetch()} />
        ) : active.length === 0 ? (
          <Empty icon="car-sport-outline" title="No rides published" body="Publish a ride with your route, time and fare. PrimeCabs reviews the fare, then customers can book seats." />
        ) : (
          active.map((r) => <RideCard key={r.id} ride={r} />)
        )}
      </Screen>
    </View>
  );
}
