import { formatMoney } from "@societyos/finance-logic";
import { font, radius, space } from "@societyos/ui";
import type { ReactNode } from "react";
import { Pressable, Text, View, type TextStyle } from "react-native";
import { CURRENCY } from "../store";
import type { Theme } from "../theme";

export function Segmented<T extends string>({ t, value, options, onChange, label }: {
  t: Theme;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const { c } = t;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 36, paddingHorizontal: space.md, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.text : c.bg }}
          >
            <Text style={{ color: on ? c.bg : c.text, fontSize: 13, fontWeight: on ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ t, label, onPress, a11y, primary, danger, disabled }: {
  t: Theme;
  label: string;
  onPress: () => void;
  a11y?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { c, f } = t;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: space.md,
        borderRadius: radius.sm,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? c.danger : c.border,
        backgroundColor: primary ? f.accent : c.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: primary ? "#FFFFFF" : danger ? c.danger : c.text, fontSize: 13, fontWeight: primary ? "700" : "500" }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ t, label, on, onPress, onRemove, a11y }: {
  t: Theme;
  label: string;
  on?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  a11y?: string;
}) {
  const { c, f } = t;
  const body = (
    <Text style={{ color: on ? f.accentText : c.text, fontSize: font.size.xs, fontWeight: on ? "600" : "400" }}>{label}</Text>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 32, paddingLeft: space.md, paddingRight: onRemove ? 0 : space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? f.accent : c.border, backgroundColor: on ? f.accentSoft : c.bg }}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={a11y ?? label} onPress={onPress} style={{ minHeight: 32, justifyContent: "center" }}>
          {body}
        </Pressable>
      ) : (
        body
      )}
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={6} onPress={onRemove} style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: c.textMuted, fontSize: 14 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Section({ t, title, right, children }: { t: Theme; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
        <Text accessibilityRole="header" style={{ color: t.c.textMuted, fontSize: font.size.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Money in is green with a "+"; money out is plain text. Never colour alone. */
export function Money({ t, minor, style, currency = CURRENCY }: { t: Theme; minor: number; style?: TextStyle; currency?: string }) {
  return (
    <Text style={[{ color: minor > 0 ? t.f.money.in : t.f.money.out, fontVariant: ["tabular-nums"], fontWeight: "600" }, style]}>
      {minor > 0 ? formatMoney(minor, currency, { signed: true }) : formatMoney(-minor, currency)}
    </Text>
  );
}

export function Empty({ t, children }: { t: Theme; children: ReactNode }) {
  return (
    <View style={{ padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: t.c.border }}>
      <Text style={{ color: t.c.textMuted, fontSize: 13, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}
