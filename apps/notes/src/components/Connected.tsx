import type { Note } from "@societyos/core";
import type { Connections } from "@societyos/notes-logic";
import { font, radius, space } from "@societyos/ui";
import { Pressable, Text, View } from "react-native";
import type { Theme } from "../theme";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * What this note is joined to across SocietyOS: its meeting, the people in
 * it, tasks made from it in Today, and notes it links to or is linked from.
 * All filled in from the text; nothing to file by hand.
 */
export function Connected({ t, note, links, onOpenNote }: { t: Theme; note: Note; links: Connections; onOpenNote: (n: Note) => void }) {
  const { c } = t;
  const section = (title: string, children: React.ReactNode) => (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{title}</Text>
      {children}
    </View>
  );
  const chip = (label: string, key: string, onPress?: () => void) => (
    <Pressable
      key={key}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      onPress={onPress}
      style={{ alignSelf: "flex-start", paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: c.surface }}
    >
      <Text style={{ color: c.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  const nothing = !links.event && !links.people.length && !links.tasks.length && !links.notes.length && !links.backlinks.length;

  return (
    <View style={{ gap: space.lg }}>
      <Text style={{ color: c.text, fontSize: font.size.sm, fontWeight: "700" }}>Connected</Text>
      {links.event ? section("MEETING", chip(`${links.event.title} · ${fmt(links.event.startsAt)}`, "event")) : null}
      {links.people.length ? section("PEOPLE", <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{links.people.map((p) => chip(p.name, p.id))}</View>) : null}
      {links.tasks.length
        ? section(
            "TASKS IN TODAY",
            links.tasks.map((task) => chip(`${task.status === "open" ? "○" : "✓"} ${task.title}`, task.id)),
          )
        : null}
      {links.notes.length ? section("LINKS TO", links.notes.map((n) => chip(n.title || "Untitled", n.id, () => onOpenNote(n)))) : null}
      {links.backlinks.length ? section("LINKED FROM", links.backlinks.map((n) => chip(n.title || "Untitled", n.id, () => onOpenNote(n)))) : null}
      {note.tags.length ? section("TAGS", <Text style={{ color: t.n.mark, fontSize: 13 }}>{note.tags.map((x) => `#${x}`).join("  ")}</Text>) : null}
      {nothing ? (
        <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>
          Mention @someone, link [[another note]], or send a checklist item to Today, and it shows here.
        </Text>
      ) : null}
    </View>
  );
}
