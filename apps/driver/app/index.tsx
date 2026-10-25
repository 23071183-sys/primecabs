// Entry: sends the driver to sign-in, onboarding, the review screen or the app.
import { Button, ErrorView, brand } from "@primecabs/mobile-ui";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { errorMessage } from "@/lib/api";
import { homeFor, useSession } from "@/lib/auth";

export default function Index() {
  const s = useSession();
  if (!s.ready) return <Splash />;
  if (!s.signedIn) return <Redirect href="/sign-in" />;
  if (s.meError && !s.me) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <ErrorView message={errorMessage(s.meError)} onRetry={() => s.refetchMe()} />
        <Button title="Sign out" kind="ghost" onPress={() => s.signOut()} />
      </View>
    );
  }
  if (!s.me) return <Splash />;
  return <Redirect href={homeFor(s.me)} />;
}

const Splash = () => (
  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: brand.navy }}>
    <ActivityIndicator color={brand.teal} size="large" />
  </View>
);
