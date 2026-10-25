// Shown while the profile is under review, or when the account is suspended.
import { Banner, Button, Card, Icon, Row, Screen, T, brand, space, useColors } from "@primecabs/mobile-ui";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { homeFor, useSession } from "@/lib/auth";
import type { PublicConfig } from "@/lib/types";

export default function Status() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { me, refetchMe, signOut, signedIn } = useSession();
  const config = useQuery({ queryKey: ["config"], queryFn: () => api<PublicConfig>("/config") });
  const [refreshing, setRefreshing] = useState(false);

  if (!signedIn) return <Redirect href="/sign-in" />;
  if (me && homeFor(me) !== "/status") return <Redirect href={homeFor(me)} />;
  const suspended = me?.status === "SUSPENDED";
  const support = config.data?.support;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: brand.navy, paddingTop: insets.top + space.xl, paddingBottom: space.xxl, paddingHorizontal: space.xl, alignItems: "center", gap: space.md }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: suspended ? "#F97066" : brand.teal, alignItems: "center", justifyContent: "center" }}>
          <Icon name={suspended ? "lock-closed" : "hourglass"} size={30} color={suspended ? "#FFFFFF" : brand.onTeal} />
        </View>
        <T variant="h2" color="#FFFFFF" style={{ textAlign: "center" }}>
          {suspended ? "Your account is suspended" : "We're checking your documents"}
        </T>
        <T variant="body" color="rgba(255,255,255,0.8)" style={{ textAlign: "center" }}>
          {suspended ? "You can't publish rides right now." : "Most drivers are approved the same day. We'll let you know as soon as it's done."}
        </T>
      </View>
      <Screen
        onRefresh={async () => {
          setRefreshing(true);
          await refetchMe().finally(() => setRefreshing(false));
        }}
        refreshing={refreshing}
      >
        {suspended && me?.rejectionReason && <Banner tone="danger" title="Reason" body={me.rejectionReason} />}
        {!suspended && (
          <Card>
            {[
              ["checkmark-circle", "Details and documents sent", true],
              ["search", "PrimeCabs checks your documents", false],
              ["car-sport", "You publish your first ride", false],
            ].map(([icon, label, done], i) => (
              <Row key={i} gap={space.md} style={{ paddingVertical: 10 }}>
                <Icon name={icon as "search"} size={22} color={done ? c.success : c.textMuted} />
                <T variant={done ? "bodyStrong" : "body"} color={done ? c.text : c.textSecondary}>
                  {label as string}
                </T>
              </Row>
            ))}
          </Card>
        )}
        <T variant="small" style={{ textAlign: "center" }}>
          Pull down to check for updates.
        </T>
        {support && (
          <Card>
            <T variant="bodyStrong">Need help?</T>
            <T variant="small" style={{ marginTop: 4 }}>
              Call PrimeCabs support, 24 hours a day.
            </T>
            <View style={{ marginTop: space.md }}>
              <Button title={`Call ${support.phone}`} kind="secondary" icon="call" onPress={() => Linking.openURL(`tel:${support.phone.replace(/\s/g, "")}`)} />
            </View>
          </Card>
        )}
        <Button title="Sign out" kind="ghost" onPress={() => signOut()} />
      </Screen>
    </View>
  );
}
