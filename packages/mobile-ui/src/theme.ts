// PrimeCabs mobile design tokens. Navy for structure, teal for the one main action per screen.
import { useColorScheme } from "react-native";

export const brand = {
  navy: "#143D75",
  navyDark: "#0F2F5B",
  teal: "#15CEAC",
  tealDark: "#0B8A72",
  onTeal: "#04342C",
};

const light = {
  bg: "#F4F6FA",
  card: "#FFFFFF",
  cardMuted: "#F1F4F9",
  border: "#E2E7EF",
  borderStrong: "#C9D1DD",
  text: "#0F172A",
  textSecondary: "#5B6678",
  textMuted: "#8A94A6",
  header: brand.navy,
  onHeader: "#FFFFFF",
  primary: brand.teal,
  primarySoft: "#E7FAF6",
  onPrimary: brand.onTeal,
  accentText: brand.tealDark,
  success: "#0E7A4F",
  successBg: "#E6F6EE",
  warning: "#8A5A00",
  warningBg: "#FFF4DB",
  danger: "#B42318",
  dangerBg: "#FDECEA",
  info: "#1D4B8C",
  infoBg: "#E8EFF9",
  overlay: "rgba(15, 23, 42, 0.45)",
};

export type Palette = typeof light;

const dark: Palette = {
  bg: "#0B1220",
  card: "#131C2E",
  cardMuted: "#1A2438",
  border: "#25324A",
  borderStrong: "#34445F",
  text: "#F1F5F9",
  textSecondary: "#A8B3C4",
  textMuted: "#76839A",
  header: "#0F2F5B",
  onHeader: "#FFFFFF",
  primary: brand.teal,
  primarySoft: "#0F2E2A",
  onPrimary: brand.onTeal,
  accentText: "#3AD8BB",
  success: "#4ADE9B",
  successBg: "#0F2E22",
  warning: "#F5C35B",
  warningBg: "#33270C",
  danger: "#F97066",
  dangerBg: "#3A1512",
  info: "#8FB4EA",
  infoBg: "#152846",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export function useColors(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 } as const;
export const font = {
  caption: 12,
  small: 13,
  body: 15,
  bodyLg: 16,
  title: 18,
  h2: 22,
  h1: 26,
} as const;

/** Minimum touch target; drivers use the app one-handed, often in a car. */
export const TAP = 48;
