import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useColors } from "./theme";

/**
 * Standard screen: scrolls, optional pull-to-refresh, and an optional footer pinned above
 * the home indicator for the screen's main action.
 */
export function Screen({ children, footer, refreshing, onRefresh, contentStyle, padded = true }: {
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[padded ? { padding: space.lg, gap: space.lg } : null, { paddingBottom: footer ? space.lg : insets.bottom + space.xl }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} /> : undefined}
      >
        {children}
      </ScrollView>
      {footer && (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.md, backgroundColor: c.card, borderTopWidth: 1, borderColor: c.border, gap: space.sm }}>
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
