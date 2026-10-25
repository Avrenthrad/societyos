import { formatMoney } from "@societyos/finance-logic";
import { font, radius, space } from "@societyos/ui";
import { Pressable, Text, View } from "react-native";
import { CURRENCY } from "../store";
import type { Theme } from "../theme";
import type { FinanceData } from "../useFinance";
import { stateLabel } from "./Bills";
import { Empty, Section } from "./ui";

/** The month at a glance: totals, where it went, who with, and bills coming up. */
export function Overview({ t, data, now, onOpenBills, narrow }: { t: Theme; data: FinanceData; now: Date; onOpenBills?: () => void; narrow?: boolean }) {
  const { c, f } = t;
  const s = data.summary;
  const attention = data.bills.filter((b) => b.unrecorded || b.state === "overdue" || b.state === "due-soon");
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: "Spent", value: formatMoney(s.spent, CURRENCY), sub: `${data.month.filter((x) => x.amountMinor < 0).length} spends` },
    { label: "Money in", value: formatMoney(s.earned, CURRENCY) },
    { label: s.net >= 0 ? "Left over" : "Over by", value: formatMoney(Math.abs(s.net), CURRENCY) },
    { label: "Bills still due", value: formatMoney(data.billsDue, CURRENCY), sub: "this month" },
  ];

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {tiles.map((x) => (
          <View key={x.label} style={{ flexGrow: 1, flexBasis: narrow ? "45%" : 140, minWidth: 0, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, gap: 2 }}>
            <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{x.label}</Text>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{x.value}</Text>
            {x.sub ? <Text style={{ color: c.textMuted, fontSize: 11 }}>{x.sub}</Text> : null}
          </View>
        ))}
      </View>

      {attention.length ? (
        <Section t={t} title="Needs you" right={onOpenBills ? <Link t={t} label="All bills" onPress={onOpenBills} /> : undefined}>
          {attention.map((b) => {
            const l = stateLabel(b, now);
            return (
              <View key={b.bill.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: f.warn, backgroundColor: f.warnSoft }}>
                <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>
                  <Text style={{ fontWeight: "600" }}>{b.bill.name}</Text> · {b.unrecorded ? "ticked off in Today, record it" : l.text}
                </Text>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>{formatMoney(b.bill.amountMinor, b.bill.currency)}</Text>
              </View>
            );
          })}
        </Section>
      ) : null}

      <Section t={t} title="Where it went">
        {s.byCategory.length ? <Bars t={t} rows={s.byCategory} total={s.spent} /> : <Empty t={t}>Spending by category shows here once you add some.</Empty>}
      </Section>

      <View style={{ flexDirection: narrow ? "column" : "row", gap: space.xl }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Section t={t} title="With people">
            {data.byPerson.length ? <Bars t={t} rows={data.byPerson.slice(0, 6)} total={s.spent} /> : <Empty t={t}>Add “with Sam” to a spend and it shows here and on Sam's timeline in People.</Empty>}
          </Section>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Section t={t} title="At places">
            {data.byPlace.length ? <Bars t={t} rows={data.byPlace.slice(0, 6)} total={s.spent} /> : <Empty t={t}>Add “at Bean Co” to a spend to see your regular places.</Empty>}
          </Section>
        </View>
      </View>
    </View>
  );
}

function Link({ t, label, onPress }: { t: Theme; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={{ color: t.f.accent, fontSize: font.size.xs, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** Horizontal bars, one hue, value written beside each so colour is never the only cue. */
function Bars({ t, rows, total }: { t: Theme; rows: { key: string; total: number; count: number }[]; total: number }) {
  const { c, f } = t;
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((r) => (
        <View key={r.key} accessible accessibilityLabel={`${r.key}: ${formatMoney(r.total, CURRENCY)}, ${Math.round((r.total / (total || 1)) * 100)} percent`} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13 }}>{r.key}</Text>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatMoney(r.total, CURRENCY)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(2, (r.total / max) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: f.accent }} />
          </View>
        </View>
      ))}
    </View>
  );
}
