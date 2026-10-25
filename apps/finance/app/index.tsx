import type { Transaction } from "@societyos/core";
import { addMonths, startOfMonth } from "@societyos/finance-logic";
import { monthNames } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Activity } from "../src/components/Activity";
import { Bills } from "../src/components/Bills";
import { ImportCsv } from "../src/components/ImportCsv";
import { Overview } from "../src/components/Overview";
import { QuickEntry } from "../src/components/QuickEntry";
import { TxDetail } from "../src/components/TxDetail";
import { Button, Segmented } from "../src/components/ui";
import { ready, store } from "../src/store";
import { useTheme, type Theme } from "../src/theme";
import { useFinance, useNow, type FinanceData } from "../src/useFinance";

/**
 * Three layouts by window width, like Today:
 * - desktop (1200+): menu, the chosen view, details side by side
 * - tablet (700+, iPad): activity or bills on the left, overview or the
 *   open transaction on the right
 * - phone: tabs, one scrolling view, quick add at the bottom, details in a sheet
 */
const DESKTOP = 1200;
const TABLET = 700;

type View_ = "overview" | "activity" | "bills" | "import";

export default function FinanceScreen() {
  const t = useTheme();
  const { c } = t;
  const now = useNow();
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP;
  const wide = width >= TABLET;
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState<View_>("overview");
  const [selectedId, setSelectedId] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    ready.then(() => setLoaded(true));
  }, []);
  const data = useFinance(month, now, loaded);

  const [selected, setSelected] = useState<Transaction>();
  useEffect(() => {
    if (!selectedId) return setSelected(undefined);
    const hit = data?.all.find((x) => x.id === selectedId);
    if (hit) setSelected(hit);
    else store.get("transaction", selectedId).then((x) => (x ? setSelected(x) : setSelectedId(undefined)));
  }, [selectedId, data]);

  if (!data) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const close = () => setSelectedId(undefined);
  const onSaved = (r: { kind: "transaction" | "bill"; id: string; open?: boolean }) => {
    if (r.kind === "bill") setView((v) => (wide && v !== "import" ? v : "bills"));
    if (r.kind === "transaction" && r.open) setSelectedId(r.id);
  };
  const imported = (n: number) => {
    setToast(n ? `Imported ${n} transaction${n === 1 ? "" : "s"}.` : "Nothing new to import.");
    setView("activity");
    setTimeout(() => setToast(undefined), 4000);
  };
  const title = `${monthNames[month.getMonth()]} ${month.getFullYear()}`;
  const entry = (compact?: boolean) => <QuickEntry t={t} people={data.people} places={data.places} compact={compact} onSaved={onSaved} />;
  const detail = selected ? <TxDetail t={t} tx={selected} people={data.people} places={data.places} events={data.events} now={now} onClose={close} /> : null;
  const activity = <Activity t={t} txs={data.month} now={now} selectedId={selectedId} onSelect={(x) => setSelectedId(x.id)} onImport={() => setView("import")} />;
  const bills = <Bills t={t} bills={data.bills} now={now} />;
  const importer = <ImportCsv t={t} existing={data.all} now={now} onDone={imported} />;
  const toastView = toast ? (
    <View accessibilityLiveRegion="polite" style={{ padding: space.md, borderRadius: radius.md, backgroundColor: t.f.accentSoft }}>
      <Text style={{ color: t.f.accentText, fontSize: 13, fontWeight: "500" }}>{toast}</Text>
    </View>
  ) : null;

  if (wide) {
    const header = (
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg, paddingHorizontal: desktop ? space.xl : space.lg, paddingVertical: space.md, backgroundColor: c.bg, borderBottomWidth: 1, borderColor: c.border }}>
        <View style={{ minWidth: desktop ? 180 : 120, gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>Finance</Text>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{title}</Text>
        </View>
        {entry()}
        <MonthPager t={t} month={month} onChange={setMonth} />
      </View>
    );

    if (desktop) {
      const main: Record<View_, ReactNode> = {
        overview: (
          <View style={{ flexDirection: "row", gap: space.xl, alignItems: "flex-start" }}>
            <View style={{ flex: 3, minWidth: 0 }}>
              <Overview t={t} data={data} now={now} onOpenBills={() => setView("bills")} />
            </View>
            <View style={{ flex: 2, minWidth: 0, gap: space.sm }}>
              <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>This month</Text>
              {activity}
            </View>
          </View>
        ),
        activity,
        bills,
        import: importer,
      };
      return (
        <View style={{ flex: 1, backgroundColor: c.surface }}>
          {header}
          <View style={{ flex: 1, flexDirection: "row" }}>
            <Nav t={t} view={view} onChange={setView} data={data} />
            <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.xl, gap: space.lg, maxWidth: 1100 }}>
              <Text accessibilityRole="header" style={{ color: c.text, fontSize: font.size.lg, fontWeight: "700" }}>{VIEW_TITLES[view]}</Text>
              {toastView}
              {main[view]}
            </ScrollView>
            {detail ? (
              <ScrollView style={{ width: 380, flexGrow: 0, borderLeftWidth: 1, borderColor: c.border, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg }}>
                {detail}
              </ScrollView>
            ) : null}
          </View>
        </View>
      );
    }

    // Tablet
    const left = view === "bills" ? "bills" : "activity";
    const right = detail ?? (view === "import" ? importer : <Overview t={t} data={data} now={now} onOpenBills={() => setView("bills")} narrow />);
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        {header}
        <View style={{ flex: 1, flexDirection: "row" }}>
          <ScrollView style={{ width: Math.min(400, width * 0.45), flexGrow: 0, borderRightWidth: 1, borderColor: c.border }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
            <Segmented t={t} label="List" value={left} onChange={(v) => setView(v)} options={[{ value: "activity", label: "Activity" }, { value: "bills", label: `Bills${badge(data)}` }]} />
            {toastView}
            {left === "bills" ? bills : activity}
          </ScrollView>
          <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
            {!detail ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text accessibilityRole="header" style={{ color: c.text, fontSize: font.size.md, fontWeight: "700" }}>{view === "import" ? "Import a bank CSV" : `${title} at a glance`}</Text>
                {view === "import" ? <Button t={t} label="Close" onPress={() => setView("activity")} /> : null}
              </View>
            ) : null}
            {right}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Phone
  const tab = view === "import" ? "activity" : view;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>Finance</Text>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{title}</Text>
        </View>
        <MonthPager t={t} month={month} onChange={setMonth} compact />
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Segmented t={t} label="View" value={tab} onChange={setView} options={[{ value: "overview", label: "Overview" }, { value: "activity", label: "Activity" }, { value: "bills", label: `Bills${badge(data)}` }]} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md }}>
        {toastView}
        {tab === "overview" ? <Overview t={t} data={data} now={now} onOpenBills={() => setView("bills")} narrow /> : tab === "activity" ? activity : bills}
      </ScrollView>
      <View style={{ padding: space.md, borderTopWidth: 1, borderColor: c.border }}>{entry(true)}</View>
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={close}>
        <Pressable accessibilityLabel="Close details" onPress={close} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} />
        <ScrollView style={{ maxHeight: "85%", backgroundColor: c.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }} contentContainerStyle={{ padding: space.lg }}>
          {detail}
        </ScrollView>
      </Modal>
      <Modal visible={view === "import"} animationType="slide" onRequestClose={() => setView("activity")}>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.lg, borderBottomWidth: 1, borderColor: c.border }}>
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: font.size.lg, fontWeight: "700" }}>Import a bank CSV</Text>
            <Button t={t} label="Close" onPress={() => setView("activity")} />
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg }}>{importer}</ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const VIEW_TITLES: Record<View_, string> = { overview: "Overview", activity: "Activity", bills: "Bills", import: "Import a bank CSV" };

const badge = (d: FinanceData) => {
  const n = d.bills.filter((b) => b.unrecorded || b.state === "overdue" || b.state === "due-soon").length;
  return n ? ` · ${n}` : "";
};

function Nav({ t, view, onChange, data }: { t: Theme; view: View_; onChange: (v: View_) => void; data: FinanceData }) {
  const { c, f } = t;
  const items: { value: View_; label: string; count?: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "activity", label: "Activity", count: String(data.month.length) },
    { value: "bills", label: "Bills", count: badge(data).replace(" · ", "") || String(data.bills.length) },
    { value: "import", label: "Import CSV" },
  ];
  return (
    <View accessibilityRole="menu" style={{ width: 200, padding: space.md, gap: 4, backgroundColor: c.bg, borderRightWidth: 1, borderColor: c.border }}>
      {items.map((n) => {
        const on = n.value === view;
        return (
          <Pressable
            key={n.value}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(n.value)}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: on ? f.accentSoft : "transparent" }}
          >
            <Text style={{ color: on ? f.accentText : c.text, fontWeight: on ? "600" : "400", fontSize: font.size.sm }}>{n.label}</Text>
            {n.count ? <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{n.count}</Text> : null}
          </Pressable>
        );
      })}
      <Text style={{ marginTop: space.md, paddingHorizontal: space.md, color: c.textMuted, fontSize: 11, lineHeight: 16 }}>
        Bills show up as tasks in Today. Spends with people show on their timeline in People.
      </Text>
    </View>
  );
}

function MonthPager({ t, month, onChange, compact }: { t: Theme; month: Date; onChange: (d: Date) => void; compact?: boolean }) {
  const btn = (label: string, a11y: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{ minWidth: 44, height: 44, paddingHorizontal: compact ? space.sm : space.md, borderRadius: radius.md, borderWidth: 1, borderColor: t.c.border, alignItems: "center", justifyContent: "center", backgroundColor: t.c.bg }}
    >
      <Text style={{ color: t.c.text, fontSize: font.size.sm, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {btn("‹", "Previous month", () => onChange(addMonths(month, -1)))}
      {btn(compact ? "Now" : "This month", "Go to this month", () => onChange(startOfMonth(new Date())))}
      {btn("›", "Next month", () => onChange(addMonths(month, 1)))}
    </View>
  );
}
