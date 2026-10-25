import type { Transaction } from "@societyos/core";
import { formatDay } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Theme } from "../theme";
import { Empty, Money } from "./ui";

/** Every transaction in the month, by day, newest first. */
export function Activity({ t, txs, now, selectedId, onSelect, onImport }: {
  t: Theme;
  txs: Transaction[];
  now: Date;
  selectedId?: string;
  onSelect: (tx: Transaction) => void;
  onImport?: () => void;
}) {
  const { c, f } = t;
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return txs;
    return txs.filter((x) => [x.description, x.category, x.account, x.notes].some((v) => v?.toLowerCase().includes(s)));
  }, [txs, q]);
  const days = useMemo(() => {
    const out: { key: string; label: string; items: Transaction[] }[] = [];
    for (const x of shown) {
      const d = new Date(x.occurredAt);
      const key = d.toDateString();
      let g = out[out.length - 1];
      if (!g || g.key !== key) out.push((g = { key, label: formatDay(d, now), items: [] }));
      g.items.push(x);
    }
    return out;
  }, [shown, now.toDateString()]);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
        <TextInput
          accessibilityLabel="Search this month"
          value={q}
          onChangeText={setQ}
          placeholder="Search this month"
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, minWidth: 0, height: 40, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, fontSize: font.size.sm }}
        />
        {onImport ? (
          <Pressable accessibilityRole="button" onPress={onImport} style={{ height: 40, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, justifyContent: "center", backgroundColor: c.bg }}>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: "500" }}>Import CSV</Text>
          </Pressable>
        ) : null}
      </View>
      {days.length === 0 ? (
        <Empty t={t}>{q ? "Nothing matches." : "Nothing this month yet. Type a spend below, snap a receipt, or import a bank CSV."}</Empty>
      ) : null}
      {days.map((d) => (
        <View key={d.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
            <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{d.label}</Text>
            <Money t={t} minor={d.items.reduce((n, x) => n + x.amountMinor, 0)} style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "500" }} />
          </View>
          {d.items.map((x) => {
            const on = x.id === selectedId;
            const sub = [x.category ?? "Uncategorised", x.account, x.billId ? "Bill" : undefined].filter(Boolean).join(" · ");
            return (
              <Pressable
                key={x.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onSelect(x)}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? f.accent : c.border, backgroundColor: c.bg }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: font.size.sm, fontWeight: "500" }}>{x.description}</Text>
                  <Text numberOfLines={1} style={{ color: x.category ? c.textMuted : t.f.warn, fontSize: font.size.xs }}>{sub}</Text>
                </View>
                {x.amountMinor === 0 ? (
                  <Text style={{ color: t.f.warn, fontSize: font.size.xs, fontWeight: "600" }}>Needs amount</Text>
                ) : (
                  <Money t={t} minor={x.amountMinor} style={{ fontSize: font.size.sm }} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
