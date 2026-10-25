// Add a vehicle, or edit one (?id=). Editing sends the vehicle back for review.
import { Banner, Button, Choice, Field, Screen, Skeleton, T, useToast } from "@primecabs/mobile-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { goBack } from "@/lib/nav";
import type { PlateType, VehicleType } from "@/lib/types";

const REG = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/;
const thisYear = new Date().getFullYear();

export default function VehicleForm() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me, refetchMe } = useSession();
  const existing = me?.vehicles.find((v) => v.id === id);
  const types = useQuery({ queryKey: ["vehicle-types"], queryFn: () => api<VehicleType[]>("/vehicle-types") });
  const [f, setF] = useState({
    vehicleTypeId: existing?.type.id ?? null,
    registrationNo: existing?.registrationNo ?? "",
    make: existing?.make ?? "",
    model: existing?.model ?? "",
    year: existing ? String(existing.year) : "",
    colour: existing?.colour ?? "",
    plateType: (existing?.plateType ?? null) as PlateType | null,
  });
  const [touched, setTouched] = useState(false);
  const reg = f.registrationNo.toUpperCase().replace(/[\s-]/g, "");

  const errors = {
    vehicleTypeId: !f.vehicleTypeId ? "Choose your vehicle type" : undefined,
    registrationNo: !REG.test(reg) ? "Enter the number as on your RC, for example MH31AB1234" : undefined,
    make: f.make.trim().length < 2 ? "Enter the company, for example Maruti Suzuki" : undefined,
    model: !f.model.trim() ? "Enter the model, for example Ertiga" : undefined,
    year: !/^\d{4}$/.test(f.year) || Number(f.year) < thisYear - 20 || Number(f.year) > thisYear + 1 ? `Enter a year between ${thisYear - 20} and ${thisYear}` : undefined,
    colour: f.colour.trim().length < 3 ? "Enter the colour" : undefined,
    plateType: !f.plateType ? "Choose the number plate colour" : undefined,
  };
  const ok = !Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const body = { vehicleTypeId: f.vehicleTypeId, registrationNo: reg, make: f.make.trim(), model: f.model.trim(), year: Number(f.year), colour: f.colour.trim(), plateType: f.plateType };
      return existing ? api(`/driver/vehicles/${existing.id}`, { method: "PUT", body }) : api("/driver/vehicles", { method: "POST", body });
    },
    onSuccess: async () => {
      await refetchMe();
      toast(existing ? "Vehicle updated" : "Vehicle added. Now upload its documents.");
      if (existing) goBack("/onboarding");
      else router.replace("/onboarding/documents");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const apiErr = save.error instanceof ApiError ? save.error : null;
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined) ?? apiErr?.field(k);

  return (
    <Screen
      footer={
        <Button
          title={existing ? "Save changes" : "Add vehicle"}
          loading={save.isPending}
          onPress={() => {
            setTouched(true);
            if (ok) save.mutate();
          }}
        />
      }
    >
      {existing && <Banner tone="warning" body="Changing vehicle details sends it back to PrimeCabs for review before you can publish rides with it." />}
      {types.data ? (
        <Choice
          label="Vehicle type"
          value={f.vehicleTypeId}
          onChange={(vehicleTypeId) => setF({ ...f, vehicleTypeId })}
          error={show("vehicleTypeId")}
          options={types.data.map((t) => ({ value: t.id, label: t.name.replace(" or similar 7-seater", ""), hint: `${t.passengerSeats} passengers` }))}
        />
      ) : (
        <Skeleton height={96} />
      )}
      <Field label="Vehicle number" value={f.registrationNo} onChangeText={(t) => setF({ ...f, registrationNo: t.toUpperCase() })} autoCapitalize="characters" placeholder="MH31AB1234" error={show("registrationNo")} />
      <Field label="Company" value={f.make} onChangeText={(make) => setF({ ...f, make })} placeholder="Maruti Suzuki" autoCapitalize="words" error={show("make")} />
      <Field label="Model" value={f.model} onChangeText={(model) => setF({ ...f, model })} placeholder="Ertiga" autoCapitalize="words" error={show("model")} />
      <Field label="Year" value={f.year} onChangeText={(t) => setF({ ...f, year: t.replace(/\D/g, "").slice(0, 4) })} keyboardType="number-pad" placeholder={String(thisYear - 2)} error={show("year")} />
      <Field label="Colour" value={f.colour} onChangeText={(colour) => setF({ ...f, colour })} placeholder="White" autoCapitalize="words" error={show("colour")} />
      <Choice
        label="Number plate"
        value={f.plateType}
        onChange={(plateType) => setF({ ...f, plateType })}
        error={show("plateType")}
        options={[
          { value: "YELLOW", label: "Yellow plate", hint: "Commercial / taxi" },
          { value: "WHITE", label: "White plate", hint: "Private car" },
        ]}
      />
      {f.plateType === "YELLOW" && <T variant="small">Yellow-plate vehicles need a TR (transport) licence. You'll upload it in the next step.</T>}
    </Screen>
  );
}
