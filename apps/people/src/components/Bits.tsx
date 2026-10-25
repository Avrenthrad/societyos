import { initials } from "@societyos/people-logic";
import { font, radius, space } from "@societyos/ui";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Theme } from "../theme";

// Avatar fills, picked by name so a person keeps their colour everywhere.
// White text passes 4.5:1 on all of them.
const AVATAR = ["#8E24AA", "#3949AB", "#00796B", "#C2185B", "#5D4037", "#455A64", "#6A1B9A", "#2E7D32", "#AD1457", "#1565C0"];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR[h % AVATAR.length], alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

export function Button({ t, label, onPress, primary, danger, a11y, small }: {
  t: Theme;
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  a11y?: string;
  small?: boolean;
}) {
  const { c } = t;
  const fg = primary ? t.onAccent : danger ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: small ? 32 : 40,
        paddingHorizontal: small ? space.md : space.lg,
        borderRadius: radius.md,
        borderWidth: primary ? 0 : 1,
        borderColor: c.border,
        backgroundColor: primary ? t.accent : c.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: fg, fontSize: small ? 13 : font.size.sm, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ t, children, count }: { t: Theme; children: ReactNode; count?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg, marginBottom: space.sm }}>
      <Text accessibilityRole="header" style={{ color: t.c.textMuted, fontSize: font.size.xs, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
        {children}
      </Text>
      {count != null ? <Text style={{ color: t.c.textMuted, fontSize: font.size.xs }}>{count}</Text> : null}
    </View>
  );
}

export function Chip({ t, label, onRemove, tone = "neutral" }: { t: Theme; label: string; onRemove?: () => void; tone?: "neutral" | "accent" }) {
  const bg = tone === "accent" ? t.accentSoft : t.c.surface;
  const fg = tone === "accent" ? t.accentText : t.c.text;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: space.sm, paddingRight: onRemove ? 0 : space.sm, minHeight: 24, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: font.size.xs, fontWeight: "500" }}>{label}</Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${label}`} hitSlop={8} onPress={onRemove} style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: fg, fontSize: 14 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
