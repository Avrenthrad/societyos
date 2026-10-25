import { Pressable, Text } from "react-native";

export function Checkbox({ checked, onToggle, label, color, size = 20 }: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  color: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      hitSlop={12}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: checked ? color : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <Text style={{ color: "#FFFFFF", fontSize: size * 0.6, fontWeight: "700", lineHeight: size * 0.75 }}>✓</Text> : null}
    </Pressable>
  );
}
