import { Button, Card, Chip, ListItem, Row, Screen, T, initials, phone, space, useColors } from "@primecabs/mobile-ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Linking, View } from "react-native";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { PublicConfig } from "@/lib/types";

export default function Account() {
  const c = useColors();
  const { me, signOut } = useSession();
  const config = useQuery({ queryKey: ["config"], queryFn: () => api<PublicConfig>("/config") });
  if (!me) return null;
  const missing = me.documents.missing.length;

  return (
    <Screen>
      <Card>
        <Row gap={space.md}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
            <T variant="title" color={c.onPrimary}>
              {initials(me.name)}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="title">{me.name}</T>
            <T variant="small">
              {phone(me.phone)}
              {me.homeCity ? ` · ${me.homeCity.name}` : ""}
            </T>
          </View>
        </Row>
      </Card>

      <T variant="label">Vehicles</T>
      <Card style={{ paddingVertical: space.xs }}>
        {me.vehicles.map((v, i) => (
          <View key={v.id} style={i > 0 ? { borderTopWidth: 1, borderColor: c.border } : null}>
            <ListItem
              icon="car-outline"
              title={`${v.make} ${v.model}`}
              subtitle={`${v.registrationNo} · ${v.type.passengerSeats} seats · ${v.plateType === "YELLOW" ? "yellow" : "white"} plate`}
              trailing={<Chip label={v.status === "APPROVED" ? "Approved" : v.status === "REJECTED" ? "Rejected" : "In review"} tone={v.status === "APPROVED" ? "success" : v.status === "REJECTED" ? "danger" : "warning"} />}
              onPress={() => router.push({ pathname: "/onboarding/vehicle", params: { id: v.id } })}
            />
          </View>
        ))}
        <View style={{ borderTopWidth: me.vehicles.length ? 1 : 0, borderColor: c.border }}>
          <ListItem icon="add-circle-outline" title="Add another vehicle" onPress={() => router.push("/onboarding/vehicle")} />
        </View>
      </Card>

      <T variant="label">Profile</T>
      <Card style={{ paddingVertical: space.xs }}>
        <ListItem
          icon="document-text-outline"
          title="Documents"
          subtitle={missing ? `${missing} needed` : "All uploaded"}
          trailing={missing ? <Chip label="Action needed" tone="warning" /> : undefined}
          onPress={() => router.push("/onboarding/documents")}
        />
        <View style={{ borderTopWidth: 1, borderColor: c.border }}>
          <ListItem
            icon="wallet-outline"
            title="Payout details"
            subtitle={me.bank.accountNoLast4 ? `Bank account ••${me.bank.accountNoLast4}` : me.bank.upiId ? `UPI ${me.bank.upiId}` : "Not added"}
            onPress={() => router.push("/onboarding/payout")}
          />
        </View>
        <View style={{ borderTopWidth: 1, borderColor: c.border }}>
          <ListItem icon="person-outline" title="Your details" subtitle="Name, age, home city" onPress={() => router.push("/onboarding/profile")} />
        </View>
      </Card>

      {config.data && (
        <>
          <T variant="label">Help</T>
          <Card style={{ paddingVertical: space.xs }}>
            <ListItem icon="call-outline" title="Call PrimeCabs support" subtitle={`${config.data.support.phone} · 24 hours`} onPress={() => Linking.openURL(`tel:${config.data.support.phone.replace(/\s/g, "")}`)} />
          </Card>
        </>
      )}
      <Button title="Sign out" kind="danger" icon="log-out-outline" onPress={() => signOut()} />
    </Screen>
  );
}
