import type { Person } from "@societyos/core";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AddPerson } from "../src/components/AddPerson";
import { Import } from "../src/components/Import";
import { PersonDetail } from "../src/components/PersonDetail";
import { PersonList, type Filter } from "../src/components/PersonList";
import { ready } from "../src/store";
import { useTheme, type Theme } from "../src/theme";
import { useNow, usePeople, type PeopleData } from "../src/usePeople";

/**
 * Three layouts by window width, matching Today:
 * - desktop (1200+): menu, list, person side by side
 * - tablet (700+, iPad): list + person
 * - phone: the list, or one person full screen; add at the bottom
 */
const DESKTOP = 1200;
const TABLET = 700;

export default function PeopleScreen() {
  const t = useTheme();
  const { c } = t;
  const now = useNow();
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP;
  const wide = width >= TABLET;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    ready.then(() => setLoaded(true));
  }, []);
  const data = usePeople(now, loaded);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("home");

  if (!data) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const selected = data.people.find((p) => p.id === selectedId);
  const select = (p: Person) => setSelectedId(p.id);
  const detail = selected ? (
    <PersonDetail
      t={t}
      person={selected}
      activity={data.activity.get(selected.id)}
      now={now}
      onClose={wide ? undefined : () => setSelectedId(undefined)}
      onDeleted={() => setSelectedId(undefined)}
    />
  ) : null;

  const search = (
    <TextInput
      accessibilityLabel="Search people"
      value={query}
      onChangeText={setQuery}
      placeholder="Search"
      placeholderTextColor={c.textMuted}
      style={{ height: 40, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.surface, color: c.text, fontSize: font.size.md, borderWidth: 1, borderColor: c.border }}
    />
  );
  const listBody = data.people.length ? (
    <PersonList t={t} data={data} now={now} query={query} filter={filter} selectedId={selectedId} onSelect={select} />
  ) : (
    <EmptyState t={t} />
  );

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg, paddingHorizontal: desktop ? space.xl : space.lg, paddingVertical: space.md, backgroundColor: c.bg, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ minWidth: desktop ? 180 : 120, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>People</Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{summaryLine(data)}</Text>
          </View>
          <AddPerson t={t} people={data.people} onAdded={select} />
        </View>
        <View style={{ flex: 1, flexDirection: "row" }}>
          {desktop ? <Nav t={t} data={data} filter={filter} onFilter={(f) => { setFilter(f); setQuery(""); }} /> : null}
          <ScrollView style={{ width: desktop ? 380 : Math.min(360, width * 0.42), flexGrow: 0, borderRightWidth: 1, borderColor: c.border, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg, paddingTop: space.md }}>
            {search}
            {!desktop ? <FilterChips t={t} data={data} filter={filter} onFilter={setFilter} /> : null}
            {listBody}
          </ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: desktop ? space.xxl : space.xl, maxWidth: 760, width: "100%", alignSelf: "center" }}>
            {detail ?? <Placeholder t={t} hasPeople={data.people.length > 0} />}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Phone
  if (selected) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        {detail}
      </ScrollView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontWeight: "700" }}>People</Text>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{summaryLine(data)}</Text>
        </View>
        {data.people.length ? search : null}
        {data.people.length ? <FilterChips t={t} data={data} filter={filter} onFilter={setFilter} /> : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.lg }}>
        {listBody}
        {data.people.length ? (
          <View style={{ marginTop: space.xl, paddingHorizontal: space.sm }}>
            <Import t={t} compact />
          </View>
        ) : null}
      </ScrollView>
      <View style={{ padding: space.md, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
        <AddPerson t={t} people={data.people} onAdded={select} compact />
      </View>
    </View>
  );
}

function summaryLine(d: PeopleData) {
  if (!d.people.length) return "No one yet";
  const parts = [`${d.people.length} ${d.people.length === 1 ? "person" : "people"}`];
  if (d.reachOut.length) parts.push(`${d.reachOut.length} to reach out to`);
  return parts.join(" · ");
}

const FILTERS = (d: PeopleData): { value: Filter; label: string; count?: number }[] => [
  { value: "home", label: "Everyone", count: d.people.length },
  { value: "reach", label: "Reach out", count: d.reachOut.length },
  { value: "birthdays", label: "Birthdays", count: d.birthdays.length },
];

function FilterChips({ t, data, filter, onFilter }: { t: Theme; data: PeopleData; filter: Filter; onFilter: (f: Filter) => void }) {
  const { c } = t;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.sm }}>
      {FILTERS(data).map((f) => {
        const on = f.value === filter;
        return (
          <Pressable
            key={f.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onFilter(f.value)}
            style={{ minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: on ? c.text : c.surface, justifyContent: "center" }}
          >
            <Text style={{ color: on ? c.bg : c.text, fontSize: 13, fontWeight: on ? "600" : "400" }}>
              {f.label}{f.count ? ` ${f.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Nav({ t, data, filter, onFilter }: { t: Theme; data: PeopleData; filter: Filter; onFilter: (f: Filter) => void }) {
  const { c } = t;
  const item = (value: Filter, label: string, count?: number) => {
    const on = value === filter;
    return (
      <Pressable
        key={value}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => onFilter(value)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: on ? t.accentSoft : "transparent" }}
      >
        <Text style={{ color: on ? t.accentText : c.text, fontSize: font.size.sm, fontWeight: on ? "600" : "400" }}>{label}</Text>
        {count ? <Text style={{ color: on ? t.accentText : c.textMuted, fontSize: 13 }}>{count}</Text> : null}
      </Pressable>
    );
  };
  const today = Platform.OS === "web" ? ((globalThis as { location?: Location }).location?.pathname ?? "/").replace(/people\/?.*$/, "") : undefined;
  return (
    <ScrollView style={{ width: 220, flexGrow: 0, borderRightWidth: 1, borderColor: c.border }} contentContainerStyle={{ padding: space.md, gap: 2 }}>
      {FILTERS(data).map((f) => item(f.value, f.label, f.count))}
      {data.tags.length ? (
        <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: space.lg, marginBottom: space.xs, paddingHorizontal: space.md }}>Groups</Text>
      ) : null}
      {data.tags.map((tag) => item(`tag:${tag}`, `#${tag}`, data.people.filter((p) => p.tags?.includes(tag)).length))}
      <View style={{ marginTop: space.xl, paddingHorizontal: space.xs, gap: space.md }}>
        <Import t={t} compact />
        {today ? (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(today)} style={{ minHeight: 32, justifyContent: "center", paddingHorizontal: space.sm }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>Open Today ›</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function EmptyState({ t }: { t: Theme }) {
  const { c } = t;
  return (
    <View style={{ gap: space.md, paddingVertical: space.xl, paddingHorizontal: space.sm }}>
      <Text style={{ color: c.text, fontSize: font.size.lg, fontWeight: "700" }}>Who matters to you?</Text>
      <Text style={{ color: c.textMuted, fontSize: font.size.sm, lineHeight: 20 }}>
        Import your contacts, or add someone in one line, like “Sam Lee bday 12 Mar every 2 weeks”. Their timeline then fills itself from Today, notes, email and money. Everything stays on this device.
      </Text>
      <Import t={t} />
    </View>
  );
}

function Placeholder({ t, hasPeople }: { t: Theme; hasPeople: boolean }) {
  return (
    <View style={{ paddingTop: space.xxl, alignItems: "center" }}>
      <Text style={{ color: t.c.textMuted, fontSize: font.size.sm, textAlign: "center", maxWidth: 360, lineHeight: 20 }}>
        {hasPeople ? "Pick someone to see their timeline, birthday and when you last caught up." : "Add your first person above, or import your contacts."}
      </Text>
    </View>
  );
}
