import { font, radius, space } from "@societyos/ui";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Theme } from "../theme";

export function Button({ t, label, onPress, kind = "outline", a11y, disabled, small, style }: {
  t: Theme;
  label: string;
  onPress: () => void;
  kind?: "primary" | "outline" | "plain" | "suggest";
  a11y?: string;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = t;
  const bg = kind === "primary" ? t.accent : kind === "suggest" ? t.suggest.bg : "transparent";
  const fg = kind === "primary" ? "#FFFFFF" : kind === "suggest" ? t.suggest.text : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: small ? 32 : 40,
          paddingHorizontal: small ? space.sm + 2 : space.md,
          borderRadius: radius.sm,
          borderWidth: kind === "outline" ? 1 : kind === "suggest" ? 1 : 0,
          borderColor: kind === "suggest" ? t.suggest.border : c.border,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text numberOfLines={1} style={{ color: fg, fontSize: small ? 13 : font.size.sm, fontWeight: kind === "primary" || kind === "suggest" ? "600" : "500" }}>{label}</Text>
    </Pressable>
  );
}

const AVATAR = ["#3D5AFE", "#EF6C00", "#8E24AA", "#00897B", "#D93025", "#188038", "#546E7A", "#1E88E5"];

export function Avatar({ name, email, size = 36, selected, t }: { name: string; email: string; size?: number; selected?: boolean; t: Theme }) {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name
    .replace(/\(.*?\)/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: selected ? t.accent : AVATAR[h % AVATAR.length], alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.38 }}>{selected ? "✓" : initials || "?"}</Text>
    </View>
  );
}

export function Chip({ label, color, t }: { label: string; color?: string; t: Theme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, borderWidth: 1, borderColor: color ?? t.c.border }}>
      {color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null}
      <Text style={{ color: t.c.textMuted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/** A list of choices in a small sheet: snooze times, labels, accounts. */
export function Menu({ t, visible, title, onClose, children }: { t: Theme; visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center", padding: space.lg }}>
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 360, maxHeight: "80%", backgroundColor: t.c.bg, borderRadius: radius.lg, padding: space.md }}>
          <Text accessibilityRole="header" style={{ color: t.c.text, fontSize: font.size.md, fontWeight: "700", padding: space.sm }}>{title}</Text>
          <ScrollView>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function MenuItem({ t, label, detail, onPress, checked }: { t: Theme; label: string; detail?: string; onPress: () => void; checked?: boolean }) {
  return (
    <Pressable
      accessibilityRole={checked === undefined ? "button" : "checkbox"}
      accessibilityState={checked === undefined ? undefined : { checked }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: pressed ? t.c.surface : "transparent" })}
    >
      {checked !== undefined ? <Text style={{ width: 18, color: t.accent, fontWeight: "700" }}>{checked ? "✓" : ""}</Text> : null}
      <Text style={{ flex: 1, color: t.c.text, fontSize: font.size.sm }}>{label}</Text>
      {detail ? <Text style={{ color: t.c.textMuted, fontSize: 12 }}>{detail}</Text> : null}
    </Pressable>
  );
}

/** "9:41 am" today, "Mon" this week, "12 Oct" this year, else "12/10/24". */
export function shortDate(iso: string, now: Date) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    const h = d.getHours();
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  }
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6 && days > 0) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]!;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]!;
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${mon}`;
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

/** "Fri 30 Oct, 7:00 pm" */
export function longDate(d: Date, withTime = true) {
  const day = `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;
  if (!withTime) return day;
  const h = d.getHours();
  return `${day}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
