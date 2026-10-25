import { blocks, colors } from "@societyos/ui";
import { useColorScheme } from "react-native";

export function useTheme() {
  const name = useColorScheme() === "dark" ? "dark" : "light";
  return { c: colors[name], b: blocks[name] };
}

export type Theme = ReturnType<typeof useTheme>;
