import type { CalendarEvent, Note } from "@societyos/core";
import { preview, type Hit } from "@societyos/notes-logic";
import { font, radius, space } from "@societyos/ui";
import type { RefObject } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Theme } from "../theme";

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function when(iso: string, now: Date) {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return hm(iso);
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export function SearchBox({ t, value, onChange, inputRef }: { t: Theme; value: string; onChange: (q: string) => void; inputRef?: RefObject<TextInput | null> }) {
  const { c } = t;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: space.md, marginVertical: space.sm, paddingHorizontal: space.md, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: value ? t.accent : c.border, backgroundColor: c.bg }}>
      <Text style={{ color: c.textMuted, marginRight: space.sm }}>⌕</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel="Search all apps"
        value={value}
        onChangeText={onChange}
        placeholder="Search notes, tasks, people…"
        placeholderTextColor={c.textMuted}
        returnKeyType="search"
        style={{ flex: 1, minWidth: 0, color: c.text, fontSize: font.size.sm, height: 42, outlineStyle: "none" } as object}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange("")} hitSlop={8}>
          <Text style={{ color: c.textMuted, fontSize: font.size.md }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Today's meetings, each one tap from its notes. */
export function Meetings({ t, meetings, now, onOpen }: { t: Theme; meetings: { event: CalendarEvent; note?: Note }[]; now: Date; onOpen: (e: CalendarEvent) => void }) {
  const { c } = t;
  const upcoming = meetings.filter((m) => new Date(m.event.endsAt) > new Date(now.getTime() - 2 * 3600_000));
  if (!upcoming.length) return null;
  return (
    <View style={{ marginHorizontal: space.md, marginBottom: space.sm, padding: space.md, gap: space.xs, borderRadius: radius.md, backgroundColor: c.surface }}>
      <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>Meetings today</Text>
      {upcoming.map(({ event, note }) => {
        const live = new Date(event.startsAt) <= now && new Date(event.endsAt) > now;
        return (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            accessibilityLabel={`${note ? "Open" : "Start"} notes for ${event.title}`}
            onPress={() => onOpen(event)}
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 }}
          >
            <Text style={{ width: 44, color: live ? t.n.mark : c.textMuted, fontSize: font.size.xs, fontWeight: live ? "700" : "400" }}>{hm(event.startsAt)}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: font.size.sm }}>{event.title}</Text>
            <View style={{ paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: note ? "transparent" : t.accent, borderWidth: 1, borderColor: note ? c.border : t.accent }}>
              <Text style={{ color: note ? c.text : t.n.onAccent, fontSize: font.size.xs, fontWeight: "600" }}>{note ? "Notes" : "Start notes"}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NoteRows({ t, notes, selectedId, now, onOpen }: { t: Theme; notes: Note[]; selectedId?: string; now: Date; onOpen: (n: Note) => void }) {
  const { c } = t;
  if (!notes.length) return <Text style={{ padding: space.lg, color: c.textMuted, fontSize: font.size.sm }}>No notes here yet.</Text>;
  return (
    <View>
      {notes.map((n) => {
        const on = n.id === selectedId;
        const sub = preview(n.body) || "No text";
        return (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onOpen(n)}
            style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: 3, borderBottomWidth: 1, borderColor: c.border, backgroundColor: on ? t.n.selected : "transparent" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              {n.pinned ? <Text style={{ color: t.n.mark, fontSize: font.size.xs }}>★</Text> : null}
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: font.size.sm, fontWeight: "600" }}>{n.title || "Untitled"}</Text>
              <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{when(n.updatedAt, now)}</Text>
            </View>
            <Text numberOfLines={2} style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>{sub}</Text>
            {n.tags.length ? (
              <Text numberOfLines={1} style={{ color: t.n.mark, fontSize: 11 }}>{n.tags.map((x) => `#${x}`).join("  ")}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Results from every app, notes first, each labelled with where it lives. */
export function SearchResults({ t, hits, selectedId, onOpenNote, onOpenOther }: { t: Theme; hits: Hit[]; selectedId?: string; onOpenNote: (n: Note) => void; onOpenOther: (h: Hit) => void }) {
  const { c } = t;
  if (!hits.length) return <Text style={{ padding: space.lg, color: c.textMuted, fontSize: font.size.sm }}>Nothing found in any app.</Text>;
  const notes = hits.filter((h) => h.app === "Notes");
  const others = hits.filter((h) => h.app !== "Notes");
  const row = (h: Hit) => {
    const on = h.entity.id === selectedId;
    return (
      <Pressable
        key={h.entity.id}
        accessibilityRole="button"
        onPress={() => (h.entity.type === "note" ? onOpenNote(h.entity) : onOpenOther(h))}
        style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: 3, borderBottomWidth: 1, borderColor: c.border, backgroundColor: on ? t.n.selected : "transparent" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: font.size.sm, fontWeight: "600" }}>{h.title}</Text>
          {h.app !== "Notes" ? <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "600" }}>{h.app.toUpperCase()}</Text> : null}
        </View>
        {h.snippet ? <Text numberOfLines={2} style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>{h.snippet}</Text> : null}
      </Pressable>
    );
  };
  const heading = (s: string) => <Text style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs, color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{s}</Text>;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
      {notes.length ? heading(`NOTES · ${notes.length}`) : null}
      {notes.map(row)}
      {others.length ? heading(`OTHER APPS · ${others.length}`) : null}
      {others.map(row)}
    </ScrollView>
  );
}
