import { appAccents, colors } from "@societyos/ui";
import { useColorScheme } from "react-native";

// People's purple, with a lighter one for dark mode and soft fills for chips.
const ACCENT = {
  light: { accent: appAccents.people, onAccent: "#FFFFFF", accentSoft: "#F3E5F5", accentText: "#5B1470" },
  dark: { accent: "#CE93D8", onAccent: "#1F0A26", accentSoft: "#3A1F44", accentText: "#F3E5F5" },
} as const;

export function useTheme() {
  const name = useColorScheme() === "dark" ? "dark" : "light";
  return { c: colors[name], ...ACCENT[name], dark: name === "dark" };
}

export type Theme = ReturnType<typeof useTheme>;
