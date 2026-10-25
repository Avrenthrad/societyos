import { appAccents, colors } from "@societyos/ui";
import { useColorScheme } from "react-native";

export function useTheme() {
  const name = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[name];
  return {
    c,
    dark: name === "dark",
    accent: name === "dark" ? c.accent : appAccents.inbox,
    /** Selected row / unread tint. */
    tint: name === "dark" ? "#1E2552" : "#E8ECFF",
    tintText: name === "dark" ? "#E0E4FF" : "#1F2E8C",
    /** SocietyOS suggestions: dates, tasks, people. */
    suggest: name === "dark" ? { bg: "#143A22", text: "#D3F2DC", border: "#81C995" } : { bg: "#DDF1E3", text: "#0D4F22", border: "#188038" },
  };
}

export type Theme = ReturnType<typeof useTheme>;
