import { brand, useColors } from "@primecabs/mobile-ui";
import { Redirect, Stack } from "expo-router";
import { useSession } from "@/lib/auth";

export default function OnboardingLayout() {
  const c = useColors();
  const { signedIn, ready } = useSession();
  if (ready && !signedIn) return <Redirect href="/sign-in" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.navy },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Get verified", headerBackVisible: false, headerLeft: () => null, gestureEnabled: false }} />
      <Stack.Screen name="profile" options={{ title: "Your details" }} />
      <Stack.Screen name="payout" options={{ title: "How you get paid" }} />
      <Stack.Screen name="vehicle" options={{ title: "Your vehicle" }} />
      <Stack.Screen name="documents" options={{ title: "Documents" }} />
    </Stack>
  );
}
