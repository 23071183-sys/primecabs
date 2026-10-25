import { Banner, Button, CodeInput, Screen, T, space, useColors, useToast } from "@primecabs/mobile-ui";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";

export default function Verify() {
  const c = useColors();
  const toast = useToast();
  const qc = useQueryClient();
  const { signIn } = useSession();
  const params = useLocalSearchParams<{ phone: string; sentTo: string; devCode?: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(30);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async (value: string) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>("/auth/otp/verify", { body: { phone: params.phone, otp: value, app: "driver" } });
      qc.clear();
      await signIn(r.token);
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.code === "OTP_LOCKED" || e.code === "OTP_EXPIRED")) setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await api<{ resendInSeconds: number; devCode?: string }>("/auth/otp/request", { body: { phone: params.phone, app: "driver" } });
      setWait(r.resendInSeconds);
      setCode("");
      setError(null);
      toast(r.devCode ? `New code sent (development: ${r.devCode})` : "New code sent");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <Screen
      footer={<Button title="Verify and continue" loading={busy} disabled={code.length !== 6} onPress={() => verify(code)} />}
      contentStyle={{ paddingTop: space.xl }}
    >
      <View style={{ gap: 6 }}>
        <T variant="h2">Enter the 6-digit code</T>
        <T variant="small">Sent by SMS to {params.sentTo ?? params.phone}.</T>
      </View>
      {!!params.devCode && <Banner tone="info" title="Development mode" body={`No SMS is sent yet. Your code is ${params.devCode}.`} />}
      <CodeInput
        label="Sign-in code"
        length={6}
        value={code}
        autoFocus
        error={!!error}
        onChange={(v) => {
          setCode(v);
          setError(null);
          if (v.length === 6) verify(v);
        }}
      />
      {error && (
        <T variant="small" color={c.danger} accessibilityRole="alert" style={{ textAlign: "center" }}>
          {error}
        </T>
      )}
      <View style={{ alignItems: "center" }}>
        {wait > 0 ? (
          <T variant="small">Resend code in {wait}s</T>
        ) : (
          <Button title="Resend code" kind="ghost" full={false} onPress={resend} />
        )}
      </View>
      <Button title="Use a different number" kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
