import { appAccents, colors } from "@societyos/ui";
import { useColorScheme } from "react-native";

/** Notes' own shades of its yellow accent. Text on the accent is always dark. */
const tints = {
  light: { selected: "#FFF4D1", chip: "#FDEBB3", onAccent: "#14161A", mark: "#8A5A00" },
  dark: { selected: "#3A3110", chip: "#4A3D10", onAccent: "#14161A", mark: "#F6CF5C" },
} as const;

export function useTheme() {
  const name = useColorScheme() === "dark" ? "dark" : "light";
  return { c: colors[name], n: tints[name], accent: appAccents.notes };
}

export type Theme = ReturnType<typeof useTheme>;
