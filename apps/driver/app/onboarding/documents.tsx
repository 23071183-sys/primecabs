// Upload each required document by camera, gallery or PDF. Latest upload counts.
import { Banner, Button, Card, Chip, Field, Icon, Row, Screen, Sheet, Skeleton, T, space, useColors, useToast, type Tone } from "@primecabs/mobile-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Platform, View } from "react-native";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { goBack } from "@/lib/nav";
import type { ChecklistItem } from "@/lib/types";
import { parseExpiry } from "@/lib/schedule";
import { pickFile, uploadDocument, type Source } from "@/lib/upload";

function statusOf(item: ChecklistItem): { label: string; tone: Tone } {
  if (!item.documentId) return item.required ? { label: "Needed", tone: "warning" } : { label: "Optional", tone: "neutral" };
  if (item.status === "APPROVED") return { label: "Approved", tone: "success" };
  if (item.status === "REJECTED") return { label: "Upload again", tone: "danger" };
  return { label: "Uploaded", tone: "info" };
}

export default function Documents() {
  const c = useColors();
  const toast = useToast();
  const qc = useQueryClient();
  const { me, refetchMe } = useSession();
  const [active, setActive] = useState<ChecklistItem | null>(null);
  const [expiry, setExpiry] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [busy, setBusy] = useState<Source | null>(null);

  if (!me) {
    return (
      <Screen>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={72} />
        ))}
      </Screen>
    );
  }
  const items = me.documents.items.filter((i) => i.required || i.documentId);
  const driverItems = items.filter((i) => !i.vehicleId);
  const missing = me.documents.missing.length;
  const parsedExpiry = parseExpiry(expiry);
  const expiryError = active?.hasExpiry && expiryTouched && !parsedExpiry ? "Enter the expiry date as DD/MM/YYYY (it must be in the future)" : undefined;

  const open = (item: ChecklistItem) => {
    setActive(item);
    setExpiry("");
    setExpiryTouched(false);
  };

  const upload = async (source: Source) => {
    if (!active) return;
    if (active.hasExpiry && !parsedExpiry) {
      setExpiryTouched(true);
      return;
    }
    setBusy(source);
    try {
      const file = await pickFile(source);
      if (!file) return;
      await uploadDocument(file, { documentTypeId: active.documentTypeId, vehicleId: active.vehicleId, expiryDate: parsedExpiry });
      await refetchMe();
      qc.invalidateQueries({ queryKey: ["me"] });
      toast(`${active.label} uploaded`);
      setActive(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const Item = ({ item }: { item: ChecklistItem }) => {
    const s = statusOf(item);
    return (
      <View style={{ paddingVertical: space.md, gap: 6 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row style={{ flex: 1 }}>
            <Icon name={item.status === "APPROVED" ? "checkmark-circle" : "document-text-outline"} size={22} color={item.status === "APPROVED" ? c.success : c.textSecondary} />
            <T variant="bodyStrong" style={{ flex: 1 }}>
              {item.label}
            </T>
          </Row>
          <Chip label={s.label} tone={s.tone} />
        </Row>
        {item.status === "REJECTED" && item.rejectReason && <T variant="small" color={c.danger}>{item.rejectReason}</T>}
        {item.status !== "APPROVED" && (
          <Button title={item.documentId ? "Replace" : "Upload"} kind="secondary" size="md" icon="cloud-upload-outline" onPress={() => open(item)} />
        )}
      </View>
    );
  };

  return (
    <>
      <Screen
        onRefresh={() => refetchMe()}
        footer={<Button title={missing ? `${missing} still needed` : "Done"} kind={missing ? "secondary" : "primary"} disabled={missing > 0} onPress={() => goBack("/onboarding")} />}
      >
        <T variant="small">Take clear photos in good light with all four corners visible. JPG, PNG or PDF, up to 5 MB each.</T>
        {me.status === "APPROVED" && <Banner tone="warning" body="Replacing a document sends your profile for review again. You can't publish new rides until it's approved." />}

        <T variant="label">About you</T>
        <Card style={{ paddingVertical: space.xs }}>
          {driverItems.map((item, i) => (
            <View key={item.documentTypeId} style={i > 0 ? { borderTopWidth: 1, borderColor: c.border } : null}>
              <Item item={item} />
            </View>
          ))}
        </Card>

        {me.vehicles.map((v) => {
          const vItems = items.filter((i) => i.vehicleId === v.id);
          return (
            <View key={v.id} style={{ gap: space.sm }}>
              <T variant="label">
                {v.make} {v.model} · {v.registrationNo}
              </T>
              <Card style={{ paddingVertical: space.xs }}>
                {vItems.map((item, i) => (
                  <View key={item.documentTypeId} style={i > 0 ? { borderTopWidth: 1, borderColor: c.border } : null}>
                    <Item item={item} />
                  </View>
                ))}
              </Card>
            </View>
          );
        })}
      </Screen>

      <Sheet visible={!!active} onClose={() => setActive(null)} title={active ? `Upload ${active.label}` : ""}>
        {active?.hasExpiry && (
          <Field
            label="Expiry date"
            placeholder="DD/MM/YYYY"
            keyboardType="numbers-and-punctuation"
            value={expiry}
            onChangeText={(t) => setExpiry(t.replace(/[^\d/]/g, "").slice(0, 10))}
            onBlur={() => setExpiryTouched(true)}
            error={expiryError}
          />
        )}
        {Platform.OS !== "web" && <Button title="Take a photo" icon="camera-outline" loading={busy === "camera"} disabled={!!busy} onPress={() => upload("camera")} />}
        <Button title="Choose from gallery" kind="secondary" icon="images-outline" loading={busy === "library"} disabled={!!busy} onPress={() => upload("library")} />
        <Button title="Choose a PDF file" kind="secondary" icon="document-outline" loading={busy === "pdf"} disabled={!!busy} onPress={() => upload("pdf")} />
      </Sheet>
    </>
  );
}
