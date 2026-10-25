import type { Person } from "@societyos/core";
import { cadenceLabel, filterPeople, formatAgo, formatDaysUntil, markCaughtUp } from "@societyos/people-logic";
import { font, radius, space } from "@societyos/ui";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { store } from "../store";
import type { Theme } from "../theme";
import type { PeopleData } from "../usePeople";
import { Avatar, Button, SectionTitle } from "./Bits";

export type Filter = "home" | "reach" | "birthdays" | `tag:${string}`;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;

function Row({ t, person, sub, right, selected, onPress }: {
  t: Theme;
  person: Person;
  sub?: string;
  right?: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = t;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, backgroundColor: selected ? t.accentSoft : "transparent" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={[person.name, sub].filter(Boolean).join(", ")}
        onPress={onPress}
        style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: space.sm, opacity: pressed ? 0.7 : 1 })}
      >
        <Avatar name={person.name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: selected ? t.accentText : c.text, fontSize: font.size.md, fontWeight: "600" }}>{person.name}</Text>
          {sub ? <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 13 }}>{sub}</Text> : null}
        </View>
      </Pressable>
      {right ? <View style={{ paddingRight: space.sm }}>{right}</View> : null}
    </View>
  );
}

function Empty({ t, children }: { t: Theme; children: ReactNode }) {
  return <Text style={{ color: t.c.textMuted, fontSize: font.size.sm, paddingVertical: space.sm, paddingHorizontal: space.sm }}>{children}</Text>;
}

/** Reach out, birthdays soon, then everyone A–Z. A search shows plain matches. */
export function PersonList({ t, data, now, query, filter, selectedId, onSelect }: {
  t: Theme;
  data: PeopleData;
  now: Date;
  query: string;
  filter: Filter;
  selectedId?: string;
  onSelect: (p: Person) => void;
}) {
  const { people, activity, reachOut, birthdays } = data;

  const lastSeen = (p: Person) => {
    const last = activity.get(p.id)?.lastContact;
    return last ? `Last in touch ${formatAgo(last, now)}` : p.emails[0] ?? p.phones[0];
  };

  const reach = (
    <>
      <SectionTitle t={t} count={reachOut.length}>Reach out</SectionTitle>
      {reachOut.length ? (
        reachOut.map((r) => (
          <Row
            key={r.person.id}
            t={t}
            person={r.person}
            selected={r.person.id === selectedId}
            onPress={() => onSelect(r.person)}
            sub={`${r.lastContact ? formatAgo(r.lastContact, now).replace(/^./, (x) => x.toUpperCase()) : "Not yet"} · aim ${cadenceLabel(r.person.keepInTouchDays!).toLowerCase()}`}
            right={<Button t={t} small label="Caught up" a11y={`Caught up with ${r.person.name} today`} onPress={() => markCaughtUp(store, r.person, now)} />}
          />
        ))
      ) : (
        <Empty t={t}>You're up to date. Set "Keep in touch" on someone to get reminders here.</Empty>
      )}
    </>
  );

  const bdays = (
    <>
      <SectionTitle t={t} count={birthdays.length}>Birthdays soon</SectionTitle>
      {birthdays.length ? (
        birthdays.map((b) => (
          <Row
            key={b.person.id}
            t={t}
            person={b.person}
            selected={b.person.id === selectedId}
            onPress={() => onSelect(b.person)}
            sub={[b.turning ? `Turns ${b.turning}` : undefined, shortDate(b.date)].filter(Boolean).join(" · ")}
            right={
              <Text style={{ color: b.daysUntil === 0 ? t.accentText : t.c.textMuted, backgroundColor: b.daysUntil === 0 ? t.accentSoft : "transparent", paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, fontSize: 13, fontWeight: b.daysUntil <= 1 ? "700" : "400" }}>
                {formatDaysUntil(b.daysUntil)}
              </Text>
            }
          />
        ))
      ) : (
        <Empty t={t}>No birthdays in the next 30 days.</Empty>
      )}
    </>
  );

  const list = (title: string, ps: Person[]) => (
    <>
      <SectionTitle t={t} count={ps.length}>{title}</SectionTitle>
      {ps.length ? (
        ps.map((p) => <Row key={p.id} t={t} person={p} selected={p.id === selectedId} onPress={() => onSelect(p)} sub={lastSeen(p)} />)
      ) : (
        <Empty t={t}>{query ? `No one matches “${query}”.` : "No one here yet."}</Empty>
      )}
    </>
  );

  if (query.trim()) return list("Results", filterPeople(people, query));
  if (filter === "reach") return reach;
  if (filter === "birthdays") return bdays;
  if (filter.startsWith("tag:")) {
    const tag = filter.slice(4);
    return list(`#${tag}`, people.filter((p) => p.tags?.includes(tag)));
  }
  if (!people.length) return null;
  return (
    <>
      {reachOut.length ? reach : null}
      {birthdays.length ? bdays : null}
      {list("Everyone", people)}
    </>
  );
}
