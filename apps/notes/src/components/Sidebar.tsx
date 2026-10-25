import type { Note } from "@societyos/core";
import { hasTag, tagTree, type TagNode } from "@societyos/notes-logic";
import { font, radius, space } from "@societyos/ui";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Theme } from "../theme";

export type Filter = { kind: "all" } | { kind: "pinned" } | { kind: "tag"; tag: string };

export function applyFilter(notes: Note[], f: Filter): Note[] {
  if (f.kind === "pinned") return notes.filter((n) => n.pinned);
  if (f.kind === "tag") return notes.filter((n) => hasTag(n, f.tag));
  return notes;
}

export function filterLabel(f: Filter): string {
  return f.kind === "all" ? "All notes" : f.kind === "pinned" ? "Pinned" : `#${f.tag}`;
}

const same = (a: Filter, b: Filter) => a.kind === b.kind && (a.kind !== "tag" || a.tag === (b as { tag: string }).tag);

function fixed(notes: Note[]): { f: Filter; label: string; count: number }[] {
  return [
    { f: { kind: "all" }, label: "All notes", count: notes.length },
    { f: { kind: "pinned" }, label: "Pinned", count: notes.filter((n) => n.pinned).length },
    { f: { kind: "tag", tag: "meeting" }, label: "Meetings", count: notes.filter((n) => hasTag(n, "meeting")).length },
  ];
}

/** Desktop: the left column of views and nested tags. */
export function Sidebar({ t, notes, filter, onFilter }: { t: Theme; notes: Note[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const { c } = t;
  const row = (f: Filter, label: string, count: number, depth = 0) => {
    const on = same(f, filter);
    return (
      <Pressable
        key={`${f.kind}:${"tag" in f ? f.tag : ""}`}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => onFilter(f)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36, paddingLeft: space.md + depth * space.md, paddingRight: space.md, borderRadius: radius.sm, backgroundColor: on ? t.n.selected : "transparent" }}
      >
        <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: on ? "600" : "400", fontSize: font.size.sm }}>{label}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{count}</Text>
      </Pressable>
    );
  };
  const tree = (nodes: TagNode[], depth: number): React.ReactNode[] =>
    nodes.flatMap((n) => [row({ kind: "tag", tag: n.path }, `#${n.name}`, n.count, depth), ...tree(n.children, depth + 1)]);
  const tags = tagTree(notes).filter((n) => n.path !== "meeting");

  return (
    <ScrollView style={{ width: 220, flexGrow: 0, backgroundColor: c.surface, borderRightWidth: 1, borderColor: c.border }} contentContainerStyle={{ padding: space.md, gap: 2 }}>
      {fixed(notes).map((x) => row(x.f, x.label, x.count))}
      <Text style={{ marginTop: space.lg, marginBottom: space.xs, paddingHorizontal: space.md, color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>TAGS</Text>
      {tags.length ? tree(tags, 0) : (
        <Text style={{ paddingHorizontal: space.md, color: c.textMuted, fontSize: font.size.xs, lineHeight: 18 }}>Type #something in a note to file it here. #work/clients nests inside #work.</Text>
      )}
    </ScrollView>
  );
}

/** Phones and iPad: the same views as a row of chips above the list. */
export function FilterChips({ t, notes, filter, onFilter }: { t: Theme; notes: Note[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const { c } = t;
  const all = [
    ...fixed(notes),
    ...tagTree(notes)
      .filter((n) => n.path !== "meeting")
      .flatMap(function walk(n): { f: Filter; label: string; count: number }[] {
        return [{ f: { kind: "tag", tag: n.path }, label: `#${n.path}`, count: n.count }, ...n.children.flatMap(walk)];
      }),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: space.md, paddingBottom: space.sm }}>
      {all.map(({ f, label, count }) => {
        const on = same(f, filter);
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onFilter(f)}
            style={{ minHeight: 34, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? t.accent : c.border, backgroundColor: on ? t.n.selected : c.bg }}
          >
            <Text style={{ color: c.text, fontSize: font.size.xs, fontWeight: on ? "600" : "400" }}>{`${label} ${count}`}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
