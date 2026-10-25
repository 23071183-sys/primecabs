import { Banner, Button, Choice, Field, Screen, T, useToast } from "@primecabs/mobile-ui";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { goBack } from "@/lib/nav";

export default function Payout() {
  const toast = useToast();
  const { me, refetchMe } = useSession();
  const [method, setMethod] = useState<"BANK" | "UPI">(me?.bank.upiId && !me.bank.accountNoLast4 ? "UPI" : "BANK");
  const [f, setF] = useState({ accountName: me?.bank.accountName ?? me?.name ?? "", accountNo: "", confirmNo: "", ifsc: me?.bank.ifsc ?? "", upi: me?.bank.upiId ?? "" });
  const [touched, setTouched] = useState(false);

  const errors =
    method === "BANK"
      ? {
          accountName: f.accountName.trim().length < 2 ? "Enter the name on the bank account" : undefined,
          accountNo: !/^\d{9,18}$/.test(f.accountNo) ? (me?.bank.accountNoLast4 && !f.accountNo ? undefined : "Account number must be 9 to 18 digits") : undefined,
          confirmNo: f.accountNo !== f.confirmNo ? "The account numbers don't match" : undefined,
          ifsc: !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc) ? "Enter the 11-character IFSC, for example SBIN0001234" : undefined,
        }
      : { upi: !/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(f.upi.trim()) ? "Enter a UPI ID like name@okaxis" : undefined };
  const ok = !Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () =>
      api("/driver/me", {
        method: "PUT",
        body:
          method === "BANK"
            ? { bankAccountName: f.accountName.trim(), bankIfsc: f.ifsc, ...(f.accountNo ? { bankAccountNo: f.accountNo } : {}) }
            : { upiId: f.upi.trim() },
      }),
    onSuccess: async () => {
      await refetchMe();
      toast("Payout details saved");
      goBack("/onboarding");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const apiErr = save.error instanceof ApiError ? save.error : null;
  const show = (k: string) => (touched ? (errors as Record<string, string | undefined>)[k] : undefined);

  return (
    <Screen
      footer={
        <Button
          title="Save"
          loading={save.isPending}
          onPress={() => {
            setTouched(true);
            if (ok) save.mutate();
          }}
        />
      }
    >
      <T variant="small">PrimeCabs pays your earnings to this account. Your account number is stored encrypted.</T>
      <Choice
        value={method}
        onChange={setMethod}
        options={[
          { value: "BANK", label: "Bank account" },
          { value: "UPI", label: "UPI ID" },
        ]}
      />
      {method === "BANK" ? (
        <>
          {me?.bank.accountNoLast4 && <Banner tone="info" body={`Saved account ending ••${me.bank.accountNoLast4}. Enter a new number only if you want to change it.`} />}
          <Field label="Account holder name" value={f.accountName} onChangeText={(accountName) => setF({ ...f, accountName })} autoCapitalize="words" error={show("accountName")} />
          <Field label="Account number" value={f.accountNo} onChangeText={(t) => setF({ ...f, accountNo: t.replace(/\D/g, "") })} keyboardType="number-pad" secureTextEntry error={show("accountNo")} />
          <Field label="Confirm account number" value={f.confirmNo} onChangeText={(t) => setF({ ...f, confirmNo: t.replace(/\D/g, "") })} keyboardType="number-pad" error={show("confirmNo")} />
          <Field label="IFSC code" value={f.ifsc} onChangeText={(t) => setF({ ...f, ifsc: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} autoCapitalize="characters" error={show("ifsc")} hint="Printed on your cheque book or passbook" />
        </>
      ) : (
        <Field label="UPI ID" value={f.upi} onChangeText={(upi) => setF({ ...f, upi })} autoCapitalize="none" placeholder="name@okaxis" error={show("upi")} />
      )}
      {apiErr && <Banner tone="danger" body={apiErr.message} />}
    </Screen>
  );
}
