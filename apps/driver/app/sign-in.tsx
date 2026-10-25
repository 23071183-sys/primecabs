import { Button, Field, Icon, T, brand, space, useColors, useToast } from "@primecabs/mobile-ui";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api, errorMessage } from "@/lib/api";

const valid = (p: string) => /^[6-9]\d{9}$/.test(p);

export default function SignIn() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  const send = useMutation({
    mutationFn: () => api<{ sentTo: string; resendInSeconds: number; devCode?: string }>("/auth/otp/request", { body: { phone, app: "driver" } }),
    onSuccess: (r) => {
      if (r.devCode) toast(`Development code: ${r.devCode}`);
      router.push({ pathname: "/verify", params: { phone, sentTo: r.sentTo, devCode: r.devCode ?? "" } });
    },
  });
  const err = send.error instanceof ApiError ? send.error : null;
  const phoneError = touched && !valid(phone) ? "Enter your 10-digit mobile number" : err?.code === "VALIDATION_FAILED" ? err.message : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: brand.navy, paddingTop: insets.top + 48, paddingBottom: 48, paddingHorizontal: space.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: space.xl }}>
            <Icon name="car-sport" size={28} color={brand.teal} />
          </View>
          <T variant="h1" color="#FFFFFF">
            PrimeCabs Driver
          </T>
          <T variant="body" color="rgba(255,255,255,0.75)" style={{ marginTop: 6 }}>
            Publish your intercity rides and fill every seat.
          </T>
        </View>

        <View style={{ padding: space.xl, gap: space.lg, flex: 1 }}>
          <T variant="title">Sign in or create your account</T>
          <Field
            label="Mobile number"
            prefix="+91"
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={10}
            placeholder="98765 43210"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
            onBlur={() => setTouched(true)}
            error={phoneError}
            returnKeyType="done"
            onSubmitEditing={() => valid(phone) && send.mutate()}
          />
          {err && err.code !== "VALIDATION_FAILED" && (
            <T variant="small" color={c.danger} accessibilityRole="alert">
              {errorMessage(err)}
            </T>
          )}
          <Button
            title="Send code"
            icon="chatbox-ellipses-outline"
            loading={send.isPending}
            onPress={() => {
              setTouched(true);
              if (valid(phone)) send.mutate();
            }}
          />
          <T variant="caption" style={{ textAlign: "center" }}>
            We'll send a 6-digit code by SMS. Standard SMS charges may apply.
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
