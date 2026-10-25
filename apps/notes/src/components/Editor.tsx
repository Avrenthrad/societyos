import type { Note, Person } from "@societyos/core";
import { saveNote, sendToToday, toggleItem, type Connections } from "@societyos/notes-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ctx, store } from "../store";
import type { Theme } from "../theme";
import { Markdown } from "./Markdown";

const SAVE_AFTER_MS = 400;

interface Props {
  t: Theme;
  note: Note;
  people: Person[];
  links: Connections;
  /** Shown under the note (phones and iPad); the desktop has its own column. */
  footer?: React.ReactNode;
  onBack?: () => void;
  onDelete: () => void;
  onOpenLink: (title: string) => void;
  onTag: (tag: string) => void;
}

/**
 * Write or read one note. Saves as you type (and when you leave), so there
 * is no save button and nothing to lose if the app closes.
 */
export function Editor({ t, note, people, links, footer, onBack, onDelete, onOpenLink, onTag }: Props) {
  const { c } = t;
  const isNew = !note.title;
  const [mode, setMode] = useState<"write" | "read">(isNew ? "write" : "read");
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  // The edit waiting to be saved. Holds its own note id, so switching notes
  // mid-edit can never save one note's text into another.
  const pending = useRef<{ id: string; title: string; body: string }>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    const p = pending.current;
    if (!p) return;
    pending.current = undefined;
    const fresh = await store.get("note", p.id);
    if (fresh) await saveNote(store, fresh, { title: p.title, body: p.body }, ctx);
  };

  // Switching notes: save the old one, load the new one.
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setMode(!note.title ? "write" : "read");
    return () => void flush();
  }, [note.id]);

  // Changes from elsewhere (a tick in Today, another tab) show up unless you are mid-edit.
  useEffect(() => {
    if (pending.current) return;
    setTitle(note.title);
    setBody(note.body);
  }, [note.updatedAt]);

  const edit = (next: { title?: string; body?: string }) => {
    const p = { id: note.id, title: next.title ?? pending.current?.title ?? title, body: next.body ?? pending.current?.body ?? body };
    setTitle(p.title);
    setBody(p.body);
    pending.current = p;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  };

  const current = async () => {
    await flush();
    return (await store.get("note", note.id)) ?? note;
  };

  const updated = new Date(note.updatedAt);
  const btn = (label: string, a11y: string, onPress: () => void, on = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ minWidth: 44, height: 40, paddingHorizontal: space.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.n.selected : "transparent", borderWidth: 1, borderColor: on ? t.accent : c.border }}
    >
      <Text style={{ color: c.text, fontSize: font.size.sm, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: c.border }}>
        {onBack ? btn("‹ Notes", "Back to notes", () => void flush().then(onBack)) : null}
        <View style={{ flex: 1 }} />
        <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 4 }}>
          {btn("Write", "Write mode", () => setMode("write"), mode === "write")}
          {btn("Read", "Read mode", () => void flush().then(() => setMode("read")), mode === "read")}
        </View>
        {btn(note.pinned ? "★" : "☆", note.pinned ? "Unpin" : "Pin to top", async () => saveNote(store, await current(), { pinned: !note.pinned }, ctx), note.pinned)}
        {btn("🗑", "Delete note", onDelete)}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.xl, paddingTop: space.lg, gap: space.md, maxWidth: 820, width: "100%", alignSelf: "center", flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {mode === "write" ? (
          <TextInput
            accessibilityLabel="Title"
            value={title}
            onChangeText={(v) => edit({ title: v })}
            placeholder="Title"
            placeholderTextColor={c.textMuted}
            style={{ color: c.text, fontSize: 26, fontWeight: "700", padding: 0, outlineStyle: "none" } as object}
          />
        ) : (
          <Text accessibilityRole="header" onPress={() => setMode("write")} style={{ color: title ? c.text : c.textMuted, fontSize: 26, fontWeight: "700" }}>{title || "Untitled"}</Text>
        )}
        <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>
          {`Edited ${updated.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${updated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · saved on this device`}
        </Text>
        {mode === "write" ? (
          <TextInput
            accessibilityLabel="Note"
            value={body}
            onChangeText={(v) => edit({ body: v })}
            onBlur={() => void flush()}
            autoFocus={isNew}
            multiline
            textAlignVertical="top"
            placeholder={"Start writing…\n\n- [ ] a checklist item\n#tag  @Person  [[Another note]]"}
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, minHeight: 320, color: c.text, fontSize: font.size.md, lineHeight: 24, padding: 0, outlineStyle: "none" } as object}
          />
        ) : (
          <Pressable accessibilityHint="Long press to edit" onLongPress={() => setMode("write")} style={{ flex: 1, minHeight: 200 }}>
            {body.trim() ? (
              <Markdown
                t={t}
                body={body}
                people={people}
                tasks={links.tasks}
                onToggle={async (item) => toggleItem(store, await current(), item, ctx)}
                onSendToToday={async (item) => void sendToToday(store, await current(), item, ctx)}
                onOpenLink={onOpenLink}
                onTag={onTag}
              />
            ) : (
              <Text style={{ color: c.textMuted, fontSize: font.size.md }}>Empty note. Tap Write to start.</Text>
            )}
          </Pressable>
        )}
        {footer}
      </ScrollView>
    </View>
  );
}
