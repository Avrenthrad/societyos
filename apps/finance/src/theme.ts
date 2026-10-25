import { appAccents, colors } from "@societyos/ui";
import { useColorScheme } from "react-native";

const tints = {
  light: { accent: appAccents.finance, accentSoft: "#DDF2EF", accentText: "#00594F", money: { in: "#188038", out: "#14161A" }, warn: "#B06000", warnSoft: "#FEF3E0" },
  dark: { accent: "#4DB6AC", accentSoft: "#123B37", accentText: "#C8EEE9", money: { in: "#81C995", out: "#ECEEF2" }, warn: "#FDD663", warnSoft: "#3A2F12" },
} as const;

export function useTheme() {
  const name = useColorScheme() === "dark" ? "dark" : "light";
  return { c: colors[name], f: tints[name] };
}

export type Theme = ReturnType<typeof useTheme>;
