// Onboarding hub: four steps, each saved as you go. Submit sends the profile for review.
import { Banner, Button, Card, Chip, Icon, ListItem, Row, Screen, Skeleton, T, space, useColors, useToast, type IconName } from "@primecabs/mobile-ui";
import { useMutation } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { View } from "react-native";
import { ApiError, api, errorMessage } from "@/lib/api";
import { homeFor, useSession } from "@/lib/auth";

export default function OnboardingHub() {
  const c = useColors();
  const toast = useToast();
  const { me, refetchMe, signOut } = useSession();
  const submit = useMutation({
    mutationFn: () => api("/driver/submit", { method: "POST", body: {} }),
    onSuccess: async () => {
      await refetchMe();
      router.replace("/status");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  if (!me) {
    return (
      <Screen>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={72} />
        ))}
      </Screen>
    );
  }
  if (homeFor(me) !== "/onboarding") return <Redirect href={homeFor(me)} />;

  const docsMissing = me.documents.missing.length;
  const steps: { icon: IconName; title: string; done: boolean; detail: string; href: "/onboarding/profile" | "/onboarding/payout" | "/onboarding/vehicle" | "/onboarding/documents"; locked?: string }[] = [
    { icon: "person-outline", title: "Your details", href: "/onboarding/profile", done: !!(me.name && me.homeCity), detail: me.name ? `${me.name}${me.homeCity ? ` · ${me.homeCity.name}` : ""}` : "Name, age and home city" },
    {
      icon: "wallet-outline",
      title: "How you get paid",
      href: "/onboarding/payout",
      done: !!(me.bank.accountNoLast4 || me.bank.upiId),
      detail: me.bank.accountNoLast4 ? `Bank account ••${me.bank.accountNoLast4}` : me.bank.upiId ? `UPI ${me.bank.upiId}` : "Bank account or UPI ID",
    },
    {
      icon: "car-outline",
      title: "Your vehicle",
      href: "/onboarding/vehicle",
      done: me.vehicles.length > 0,
      detail: me.vehicles.length ? me.vehicles.map((v) => `${v.make} ${v.model} · ${v.registrationNo}`).join(", ") : "Type, number and plate colour",
    },
    {
      icon: "document-text-outline",
      title: "Documents",
      href: "/onboarding/documents",
      done: me.vehicles.length > 0 && docsMissing === 0,
      locked: me.vehicles.length === 0 ? "Add your vehicle first" : undefined,
      detail: me.vehicles.length === 0 ? "Licence, Aadhaar, RC and more" : docsMissing ? `${docsMissing} still to upload` : "All uploaded",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <Screen
      footer={
        <>
          <Button title="Send for review" icon="paper-plane" loading={submit.isPending} disabled={!allDone} onPress={() => submit.mutate()} />
          {!allDone && (
            <T variant="caption" style={{ textAlign: "center" }}>
              Finish all {steps.length} steps to send your profile.
            </T>
          )}
        </>
      }
    >
      {me.status === "REJECTED" && me.rejectionReason && (
        <Banner tone="danger" title="Please fix and send again" body={me.rejectionReason} />
      )}
      <View style={{ gap: 6 }}>
        <T variant="h2">Become a PrimeCabs driver</T>
        <T variant="small">Your progress is saved after every step. Approval usually happens the same day.</T>
      </View>
      <Card>
        <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
          <T variant="bodyStrong">
            {doneCount} of {steps.length} done
          </T>
          {allDone && <Chip tone="success" label="Ready to send" icon="checkmark" />}
        </Row>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {steps.map((s, i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: s.done ? c.primary : c.border }} />
          ))}
        </View>
      </Card>
      <Card style={{ paddingVertical: space.sm }}>
        {steps.map((s, i) => (
          <View key={s.title} style={i > 0 ? { borderTopWidth: 1, borderColor: c.border } : null}>
            <ListItem
              icon={s.icon}
              title={s.title}
              subtitle={s.locked ?? s.detail}
              trailing={s.done ? <Icon name="checkmark-circle" size={24} color={c.success} /> : undefined}
              onPress={s.locked ? undefined : () => router.push(s.href)}
            />
          </View>
        ))}
      </Card>
      {submit.error instanceof ApiError && submit.error.details?.missing && (
        <Banner tone="warning" body={submit.error.message} />
      )}
      <Button title="Sign out" kind="ghost" onPress={() => signOut()} />
    </Screen>
  );
}
