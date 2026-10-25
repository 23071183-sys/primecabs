import { Button, Choice, Field, Screen, Skeleton, T, useToast } from "@primecabs/mobile-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { goBack } from "@/lib/nav";
import type { City, Gender } from "@/lib/types";

export default function Profile() {
  const toast = useToast();
  const { me, refetchMe } = useSession();
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/cities") });
  const [f, setF] = useState({ name: "", email: "", age: "", gender: null as Gender | null, homeCityId: null as string | null });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (me) setF({ name: me.name ?? "", email: me.email ?? "", age: me.age ? String(me.age) : "", gender: me.gender, homeCityId: me.homeCity?.id ?? null });
  }, [me]);

  const errors = {
    name: f.name.trim().length < 2 ? "Enter your full name as on your licence" : undefined,
    age: !/^\d{2}$/.test(f.age) || Number(f.age) < 18 || Number(f.age) > 75 ? "Enter your age (18 to 75)" : undefined,
    gender: !f.gender ? "Choose one" : undefined,
    homeCityId: !f.homeCityId ? "Choose the city you drive from" : undefined,
    email: f.email && !/^\S+@\S+\.\S+$/.test(f.email) ? "Enter a valid email or leave it empty" : undefined,
  };
  const ok = !Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () =>
      api("/driver/me", {
        method: "PUT",
        body: { name: f.name.trim(), age: Number(f.age), gender: f.gender, homeCityId: f.homeCityId, ...(f.email ? { email: f.email.trim() } : {}) },
      }),
    onSuccess: async () => {
      await refetchMe();
      toast("Details saved");
      goBack("/onboarding");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const apiErr = save.error instanceof ApiError ? save.error : null;
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined) ?? apiErr?.field(k);

  return (
    <Screen
      footer={
        <Button
          title="Save and continue"
          loading={save.isPending}
          onPress={() => {
            setTouched(true);
            if (ok) save.mutate();
          }}
        />
      }
    >
      <T variant="small">Use your name exactly as it appears on your driving licence.</T>
      <Field label="Full name" value={f.name} onChangeText={(name) => setF({ ...f, name })} autoCapitalize="words" autoComplete="name" error={show("name")} />
      <Field label="Age" value={f.age} onChangeText={(age) => setF({ ...f, age: age.replace(/\D/g, "").slice(0, 2) })} keyboardType="number-pad" error={show("age")} />
      <Choice
        label="Gender"
        value={f.gender}
        onChange={(gender) => setF({ ...f, gender })}
        error={show("gender")}
        options={[
          { value: "MALE", label: "Male" },
          { value: "FEMALE", label: "Female" },
          { value: "OTHER", label: "Other" },
        ]}
      />
      {cities.data ? (
        <Choice label="Home city" value={f.homeCityId} onChange={(homeCityId) => setF({ ...f, homeCityId })} error={show("homeCityId")} options={cities.data.map((c) => ({ value: c.id, label: c.name }))} />
      ) : (
        <Skeleton height={48} />
      )}
      <Field label="Email (optional)" value={f.email} onChangeText={(email) => setF({ ...f, email })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={show("email")} />
    </Screen>
  );
}
