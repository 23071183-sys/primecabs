// Shared building blocks for the PrimeCabs mobile apps.
import Ionicons from "@expo/vector-icons/Ionicons";
import { forwardRef, useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { font, radius, space, TAP, useColors, type Palette } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export const Icon = ({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) => {
  const c = useColors();
  return <Ionicons name={name} size={size} color={color ?? c.textSecondary} />;
};

// ---------- Text ----------

type Variant = "h1" | "h2" | "title" | "body" | "bodyStrong" | "small" | "caption" | "label";
export function T({ variant = "body", color, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  const c = useColors();
  const v: Record<Variant, object> = {
    h1: { fontSize: font.h1, fontWeight: "700", color: c.text, letterSpacing: -0.3 },
    h2: { fontSize: font.h2, fontWeight: "700", color: c.text, letterSpacing: -0.2 },
    title: { fontSize: font.title, fontWeight: "600", color: c.text },
    body: { fontSize: font.body, color: c.text, lineHeight: 21 },
    bodyStrong: { fontSize: font.body, fontWeight: "600", color: c.text },
    small: { fontSize: font.small, color: c.textSecondary, lineHeight: 18 },
    caption: { fontSize: font.caption, color: c.textMuted },
    label: { fontSize: font.caption, fontWeight: "600", color: c.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 },
  };
  return <Text {...rest} style={[v[variant], color ? { color } : null, style]} />;
}

// ---------- Buttons ----------

type ButtonKind = "primary" | "secondary" | "danger" | "ghost";
export function Button({ title, onPress, kind = "primary", loading, disabled, icon, full = true, size = "lg", style }: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  full?: boolean;
  size?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg: Record<ButtonKind, string> = { primary: c.primary, secondary: c.card, danger: c.card, ghost: "transparent" };
  const fg: Record<ButtonKind, string> = { primary: c.onPrimary, secondary: c.text, danger: c.danger, ghost: c.accentText };
  const border: Record<ButtonKind, string | undefined> = { primary: undefined, secondary: c.borderStrong, danger: c.dangerBg, ghost: undefined };
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      accessibilityLabel={title}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: size === "lg" ? 54 : TAP - 4,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          backgroundColor: bg[kind],
          borderWidth: border[kind] ? 1 : 0,
          borderColor: border[kind],
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          alignSelf: full ? "stretch" : "flex-start",
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg[kind]} /> : icon ? <Ionicons name={icon} size={20} color={fg[kind]} /> : null}
      <Text style={{ color: fg[kind], fontSize: size === "lg" ? font.bodyLg : font.body, fontWeight: kind === "primary" ? "700" : "600" }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color, bg }: { name: IconName; onPress: () => void; label: string; color?: string; bg?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ width: TAP - 4, height: TAP - 4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: bg ?? "transparent", opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons name={name} size={22} color={color ?? c.text} />
    </Pressable>
  );
}

// ---------- Surfaces ----------

export function Card({ children, style, onPress, highlight }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; highlight?: boolean }) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: highlight ? 1.5 : StyleSheet.hairlineWidth,
    borderColor: highlight ? c.primary : c.border,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export const Row = ({ children, gap = space.sm, style, align = "center" }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle["alignItems"] }) => (
  <View style={[{ flexDirection: "row", alignItems: align, gap }, style]}>{children}</View>
);

export const Spacer = ({ h = space.lg }: { h?: number }) => <View style={{ height: h }} />;

export function Divider({ dashed }: { dashed?: boolean }) {
  const c = useColors();
  return <View style={{ height: 0, borderTopWidth: 1, borderColor: c.border, borderStyle: dashed ? "dashed" : "solid", marginVertical: space.md }} />;
}

// ---------- Status ----------

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const toneColors = (c: Palette, t: Tone) =>
  ({
    success: [c.successBg, c.success],
    warning: [c.warningBg, c.warning],
    danger: [c.dangerBg, c.danger],
    info: [c.infoBg, c.info],
    neutral: [c.cardMuted, c.textSecondary],
  })[t];

export function Chip({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const c = useColors();
  const [bg, fg] = toneColors(c, tone);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}>
      {icon && <Ionicons name={icon} size={13} color={fg} />}
      <Text style={{ color: fg, fontSize: font.caption, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone = "info", title, body, icon, action }: { tone?: Tone; title?: string; body: string; icon?: IconName; action?: ReactNode }) {
  const c = useColors();
  const [bg, fg] = toneColors(c, tone);
  const defaultIcon: IconName = tone === "danger" ? "alert-circle" : tone === "warning" ? "time" : tone === "success" ? "checkmark-circle" : "information-circle";
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md, flexDirection: "row", gap: space.sm }}>
      <Ionicons name={icon ?? defaultIcon} size={20} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title && <Text style={{ color: fg, fontWeight: "700", fontSize: font.body }}>{title}</Text>}
        <Text style={{ color: fg, fontSize: font.small, lineHeight: 19 }}>{body}</Text>
        {action}
      </View>
    </View>
  );
}

/** Seat-fill bar: one segment per seat. */
export function SeatBar({ sold, total }: { sold: number; total: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel={`${sold} of ${total} seats booked`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < sold ? c.primary : c.border }} />
      ))}
    </View>
  );
}

// ---------- Forms ----------

export const Field = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label: string; error?: string; hint?: string; prefix?: string; suffix?: string }>(function Field(
  { label, error, hint, prefix, suffix, style, ...rest },
  ref,
) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: font.small, fontWeight: "600", color: c.textSecondary }}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: TAP + 4,
          borderRadius: radius.md,
          borderWidth: focused || error ? 1.5 : 1,
          borderColor: error ? c.danger : focused ? c.primary : c.borderStrong,
          backgroundColor: rest.editable === false ? c.cardMuted : c.card,
          paddingHorizontal: space.md,
        }}
      >
        {prefix && <Text style={{ fontSize: font.bodyLg, color: c.textSecondary, marginRight: 6 }}>{prefix}</Text>}
        <TextInput
          ref={ref}
          placeholderTextColor={c.textMuted}
          {...rest}
          onFocus={(e) => (setFocused(true), rest.onFocus?.(e))}
          onBlur={(e) => (setFocused(false), rest.onBlur?.(e))}
          accessibilityLabel={label}
          style={[{ flex: 1, fontSize: font.bodyLg, color: c.text, paddingVertical: 12 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null, style]}
        />
        {suffix && <Text style={{ fontSize: font.body, color: c.textSecondary, marginLeft: 6 }}>{suffix}</Text>}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: font.small, color: c.danger }}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ fontSize: font.small, color: c.textMuted }}>{hint}</Text>
      ) : null}
    </View>
  );
});

/** Pick one of a few options, shown as large pills. */
export function Choice<V extends string>({ label, value, options, onChange, error }: {
  label?: string;
  value: V | null | undefined;
  options: { value: V; label: string; hint?: string }[];
  onChange: (v: V) => void;
  error?: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ fontSize: font.small, fontWeight: "600", color: c.textSecondary }}>{label}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: TAP - 4,
                paddingHorizontal: space.lg,
                paddingVertical: 10,
                borderRadius: radius.md,
                borderWidth: on ? 1.5 : 1,
                borderColor: on ? c.primary : c.borderStrong,
                backgroundColor: on ? c.primarySoft : c.card,
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: font.body, fontWeight: on ? "700" : "500", color: c.text }}>{o.label}</Text>
              {o.hint && <Text style={{ fontSize: font.caption, color: c.textSecondary }}>{o.hint}</Text>}
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={{ fontSize: font.small, color: c.danger }}>{error}</Text>}
    </View>
  );
}

export function Stepper({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string }) {
  const c = useColors();
  const btn = (name: IconName, next: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={next < min || next > max}
      onPress={() => onChange(next)}
      style={{ width: TAP + 4, height: TAP + 4, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", opacity: next < min || next > max ? 0.35 : 1, backgroundColor: c.card }}
    >
      <Ionicons name={name} size={22} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: font.small, fontWeight: "600", color: c.textSecondary }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        {btn("remove", value - 1, `Fewer ${label.toLowerCase()}`)}
        <Text style={{ minWidth: 40, textAlign: "center", fontSize: font.h2, fontWeight: "700", color: c.text }} accessibilityLiveRegion="polite">
          {value}
        </Text>
        {btn("add", value + 1, `More ${label.toLowerCase()}`)}
      </View>
      {hint && <Text style={{ fontSize: font.small, color: c.textMuted }}>{hint}</Text>}
    </View>
  );
}

/** Large one-digit-per-box code entry (4 for trip codes, 6 for sign-in). */
export function CodeInput({ length, value, onChange, autoFocus, error, label }: { length: number; value: string; onChange: (v: string) => void; autoFocus?: boolean; error?: boolean; label: string }) {
  const c = useColors();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={label}>
      <View style={{ flexDirection: "row", gap: space.sm, justifyContent: "center" }}>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          const active = i === value.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 58,
                height: 60,
                borderRadius: radius.md,
                borderWidth: active || filled ? 1.5 : 1,
                borderColor: error ? c.danger : active || filled ? c.primary : c.borderStrong,
                backgroundColor: c.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 26, fontWeight: "700", color: c.text }}>{value[i] ?? ""}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

// ---------- States ----------

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: ViewStyle["width"]; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View accessibilityLabel="Loading" style={[{ height, width, borderRadius: radius.sm, backgroundColor: c.border, opacity }, style]} />;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.cardMuted, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={24} color={c.textSecondary} />
      </View>
      <T variant="bodyStrong" style={{ textAlign: "center" }}>
        {title}
      </T>
      {body && (
        <T variant="small" style={{ textAlign: "center" }}>
          {body}
        </T>
      )}
      {action && <View style={{ marginTop: space.sm, alignSelf: "stretch" }}>{action}</View>}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Empty
      icon="cloud-offline-outline"
      title="Couldn't load this"
      body={message}
      action={onRetry && <Button title="Try again" kind="secondary" icon="refresh" onPress={onRetry} />}
    />
  );
}

// ---------- Bottom sheet ----------

export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "88%", paddingBottom: space.xl }}>
          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm }}>
            <T variant="title">{title}</T>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.lg, paddingBottom: space.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.sm }}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

/** Label/value row for detail cards. */
export function InfoRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 6 }}>
      <T variant="small">{label}</T>
      {typeof value === "string" ? (
        <T variant={strong ? "bodyStrong" : "body"} style={{ textAlign: "right", flexShrink: 1 }}>
          {value}
        </T>
      ) : (
        value
      )}
    </View>
  );
}

/** Tappable list row with an icon, title, subtitle and trailing content. */
export function ListItem({ icon, title, subtitle, trailing, onPress }: { icon?: IconName; title: string; subtitle?: string; trailing?: ReactNode; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TAP + 8, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}
    >
      {icon && (
        <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: c.cardMuted, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={20} color={c.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{title}</T>
        {subtitle && <T variant="small">{subtitle}</T>}
      </View>
      {trailing}
      {onPress && <Ionicons name="chevron-forward" size={18} color={c.textMuted} />}
    </Pressable>
  );
}
