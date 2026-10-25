import type { Person, Task } from "@societyos/core";
import { checklist, extractMentions, taskForItem, type ChecklistItem } from "@societyos/notes-logic";
import { font, radius, space } from "@societyos/ui";
import { Fragment, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Theme } from "../theme";

interface Props {
  t: Theme;
  body: string;
  people: Person[];
  tasks: Task[];
  onToggle: (item: ChecklistItem) => void;
  onSendToToday: (item: ChecklistItem) => void;
  onOpenLink: (title: string) => void;
  onTag: (tag: string) => void;
}

/**
 * Read view of a note. Plain Markdown, drawn with a few touches: headings,
 * lists, quotes, tickable checklists, and tappable [[links]], @people and
 * #tags. Kept simple on purpose: what you type is what is stored.
 */
export function Markdown({ t, body, people, tasks, onToggle, onSendToToday, onOpenLink, onTag }: Props) {
  const { c } = t;
  const items = new Map(checklist(body).map((i) => [i.line, i]));
  const mentioned = extractMentions(body, people);
  const inline = (text: string, base: object) => <Inline t={t} text={text} people={mentioned} base={base} onOpenLink={onOpenLink} onTag={onTag} />;
  const lines = body.split("\n");
  const out: ReactNode[] = [];
  let inCode = false;

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      return;
    }
    if (inCode) {
      out.push(
        <Text key={i} selectable style={{ fontFamily: "monospace", fontSize: 13, color: c.text, backgroundColor: c.surface, paddingHorizontal: space.sm }}>{line || " "}</Text>,
      );
      return;
    }
    const item = items.get(i);
    if (item) {
      const task = taskForItem(item, tasks);
      out.push(
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 36 }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.text}
            onPress={() => onToggle(item)}
            hitSlop={10}
            style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: item.done ? t.accent : c.textMuted, backgroundColor: item.done ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}
          >
            {item.done ? <Text style={{ color: t.n.onAccent, fontSize: 12, fontWeight: "700", lineHeight: 14 }}>✓</Text> : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            {inline(item.text, { color: item.done ? c.textMuted : c.text, fontSize: font.size.md, textDecorationLine: item.done ? "line-through" : "none" })}
          </View>
          {task ? (
            <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{task.status === "open" ? "In Today" : "Done in Today"}</Text>
          ) : item.done ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Make “${item.text}” a task in Today`}
              onPress={() => onSendToToday(item)}
              style={{ minHeight: 32, paddingHorizontal: space.sm, justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: c.border }}
            >
              <Text style={{ color: c.text, fontSize: font.size.xs, fontWeight: "600" }}>→ Today</Text>
            </Pressable>
          )}
        </View>,
      );
      return;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      out.push(
        <Text key={i} accessibilityRole="header" style={{ marginTop: i ? space.md : 0, marginBottom: 2 }}>
          {inline(h[2]!, { color: c.text, fontWeight: "700", fontSize: level === 1 ? 24 : level === 2 ? 19 : 16 })}
        </Text>,
      );
      return;
    }
    const bullet = /^(\s*)([-*+]|\d+\.)\s*(.*)$/.exec(line);
    if (bullet && /^\s*([-*+]|\d+\.)\s*$/.test(line)) return; // an empty bullet waiting to be filled in
    if (bullet && /^\s*([-*+]|\d+\.)\s/.test(line)) {
      const indent = Math.min(4, Math.floor(bullet[1]!.length / 2));
      out.push(
        <View key={i} style={{ flexDirection: "row", gap: space.sm, paddingLeft: indent * space.lg, minHeight: 24 }}>
          <Text style={{ color: c.textMuted, fontSize: font.size.md, minWidth: 14 }}>{/\d/.test(bullet[2]!) ? bullet[2] : "•"}</Text>
          <View style={{ flex: 1 }}>{inline(bullet[3]!, { color: c.text, fontSize: font.size.md, lineHeight: 24 })}</View>
        </View>,
      );
      return;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      out.push(
        <View key={i} style={{ borderLeftWidth: 3, borderColor: t.accent, paddingLeft: space.md }}>
          {inline(quote[1]!, { color: c.textMuted, fontSize: font.size.md, lineHeight: 24 })}
        </View>,
      );
      return;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      out.push(<View key={i} style={{ height: 1, backgroundColor: c.border, marginVertical: space.sm }} />);
      return;
    }
    out.push(line.trim() ? <Fragment key={i}>{inline(line, { color: c.text, fontSize: font.size.md, lineHeight: 24 })}</Fragment> : <View key={i} style={{ height: 12 }} />);
  });

  return <View style={{ gap: 2 }}>{out}</View>;
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|#[\p{L}\p{N}_/-]+|@[\p{L}\p{N}_-]+(?:\s[\p{L}\p{N}_-]+)*)/gu;

/** Bold, code, [[links]], #tags and @people inside one line. */
function Inline({ t, text, people, base, onOpenLink, onTag }: { t: Theme; text: string; people: Person[]; base: object; onOpenLink: (title: string) => void; onTag: (tag: string) => void }) {
  const { c } = t;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    let tok = m[0];
    const at = m.index!;
    if (tok.startsWith("#") && at > 0 && !/\s/.test(text[at - 1]!)) continue; // "x.com/#a", not a tag
    if (tok.startsWith("@")) {
      // Only highlight the part that is a real person's name.
      const lower = tok.slice(1).toLowerCase();
      const hit = people.map((p) => p.name.toLowerCase()).concat(people.map((p) => p.name.split(/\s+/)[0]!.toLowerCase()))
        .filter((n) => lower.startsWith(n) && !/[\p{L}\p{N}]/u.test(lower[n.length] ?? ""))
        .sort((a, b) => b.length - a.length)[0];
      if (!hit) continue;
      tok = tok.slice(0, hit.length + 1);
    }
    if (at > last) parts.push(text.slice(last, at));
    const key = `${at}`;
    if (tok.startsWith("**")) parts.push(<Text key={key} style={{ fontWeight: "700" }}>{tok.slice(2, -2)}</Text>);
    else if (tok.startsWith("`")) parts.push(<Text key={key} style={{ fontFamily: "monospace", backgroundColor: c.surface }}>{tok.slice(1, -1)}</Text>);
    else if (tok.startsWith("[[")) {
      const title = tok.slice(2, -2).trim();
      parts.push(<Text key={key} accessibilityRole="link" onPress={() => onOpenLink(title)} style={{ color: t.n.mark, textDecorationLine: "underline" }}>{title}</Text>);
    } else if (tok.startsWith("#")) {
      const tag = tok.slice(1).toLowerCase();
      parts.push(<Text key={key} accessibilityRole="link" onPress={() => onTag(tag)} style={{ color: t.n.mark, fontWeight: "600" }}>{tok}</Text>);
    } else parts.push(<Text key={key} style={{ color: t.n.mark, fontWeight: "600", backgroundColor: t.n.selected, borderRadius: radius.sm }}>{tok}</Text>);
    last = at + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Text selectable style={base}>{parts}</Text>;
}
