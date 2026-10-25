import { Choice, Empty, ErrorView, Screen, Skeleton } from "@primecabs/mobile-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RideCard } from "@/components/RideCard";
import { api, errorMessage } from "@/lib/api";
import type { DriverRide } from "@/lib/types";

export default function Trips() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const q = useQuery({ queryKey: ["rides", scope], queryFn: () => api<DriverRide[]>("/driver/rides", { query: { scope } }) });

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Choice
        value={scope}
        onChange={setScope}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
        ]}
      />
      {q.isLoading ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={110} style={{ borderRadius: 14 }} />)
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <Empty icon="calendar-outline" title={scope === "upcoming" ? "No upcoming trips" : "No past trips yet"} body={scope === "upcoming" ? "Rides you publish show up here." : "Completed and cancelled rides show up here."} />
      ) : (
        q.data.map((r) => <RideCard key={r.id} ride={r} />)
      )}
    </Screen>
  );
}
