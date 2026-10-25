import Ionicons from "@expo/vector-icons/Ionicons";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tone = "success" | "error";
const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: Tone = "success") => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, tone });
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(
        () => Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null)),
        tone === "error" ? 4500 : 2800,
      );
    },
    [opacity],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 84, opacity, alignItems: "center" }}>
          <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0F172A", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 480 }}>
            <Ionicons name={toast.tone === "success" ? "checkmark-circle" : "alert-circle"} size={18} color={toast.tone === "success" ? "#3AD8BB" : "#F97066"} />
            <Text style={{ color: "white", fontSize: 14, flexShrink: 1 }}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
