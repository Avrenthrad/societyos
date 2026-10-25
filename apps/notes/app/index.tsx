import type { CalendarEvent, Note } from "@societyos/core";
import { findByTitle, newNote, openMeetingNote, sortNotes, type Hit } from "@societyos/notes-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Connected } from "../src/components/Connected";
import { Editor } from "../src/components/Editor";
import { Meetings, NoteRows, SearchBox, SearchResults } from "../src/components/NoteList";
import { applyFilter, FilterChips, filterLabel, Sidebar, type Filter } from "../src/components/Sidebar";
import { ctx, ready, store } from "../src/store";
import { useTheme, type Theme } from "../src/theme";
import { useAllNotes, useAutomations, useConnections, useMeetings, useNow, usePeople, useSearch } from "../src/useNotes";

/**
 * Three layouts by window width:
 * - desktop (1100+): tags, list, note, and what it is connected to
 * - tablet (700+, iPad): list beside the note
 * - phone: the list, then the note full screen
 */
const DESKTOP = 1100;
const TABLET = 700;

/** Where the other SocietyOS apps live on the web, next to this one. */
const APP_PATHS: Partial<Record<Hit["app"], string>> = { Today: "../", People: "../people/", Inbox: "../inbox/", Finance: "../finance/" };

export default function NotesScreen() {
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
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [undo, setUndo] = useState<Note>();
  const searchRef = useRef<TextInput>(null);

  const all = useAllNotes(loaded);
  const people = usePeople(loaded);
  const hits = useSearch(query, now);
  const meetings = useMeetings(now, loaded);
  const links = useConnections(selectedId);
  useAutomations(now, loaded, selectedId);

  const notes = useMemo(() => sortNotes(applyFilter(all, filter)), [all, filter]);
  const selected = all.find((n) => n.id === selectedId);

  // Desktop and iPad: always show a note when there is one.
  useEffect(() => {
    if (wide && loaded && !selected && notes[0] && !query) setSelectedId(notes[0].id);
  }, [wide, loaded, selected, notes, query]);

  // Ctrl/Cmd+K jumps to search on computers.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /** Open a note; a note left completely empty is tidied away. */
  const open = async (id: string | undefined) => {
    if (selectedId && selectedId !== id) {
      const prev = await store.get("note", selectedId);
      if (prev && !prev.title.trim() && !prev.body.trim()) await store.remove("note", prev.id);
    }
    setSelectedId(id);
  };
  const create = async (title = "") => {
    const n = newNote(ctx, { title, body: filter.kind === "tag" ? `#${filter.tag}\n\n` : "" });
    await store.put(n);
    setQuery("");
    await open(n.id);
  };
  const remove = async (n: Note) => {
    await store.remove("note", n.id);
    setUndo(n);
    setSelectedId(undefined);
  };
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(undefined), 6000);
    return () => clearTimeout(id);
  }, [undo]);
  const restore = async () => {
    if (!undo) return;
    await store.put({ ...undo, deletedAt: undefined });
    setSelectedId(undo.id);
    setUndo(undefined);
  };
  const openLink = async (title: string) => {
    const target = findByTitle(all, title);
    if (target) await open(target.id);
    else await create(title);
  };
  const openMeeting = async (e: CalendarEvent) => open((await openMeetingNote(store, e, ctx)).id);
  const openOther = (h: Hit) => {
    const path = APP_PATHS[h.app];
    if (Platform.OS === "web" && path) globalThis.location.assign(path);
  };
  const pickFilter = (f: Filter) => {
    setFilter(f);
    setQuery("");
  };
  const tagFilter = (tag: string) => pickFilter({ kind: "tag", tag });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const listBody = query.trim() ? (
    <SearchResults t={t} hits={hits} selectedId={selectedId} onOpenNote={(n) => void open(n.id)} onOpenOther={openOther} />
  ) : (
    <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
      {filter.kind === "all" ? <Meetings t={t} meetings={meetings} now={now} onOpen={openMeeting} /> : null}
      <NoteRows t={t} notes={notes} selectedId={selectedId} now={now} onOpen={(n) => void open(n.id)} />
    </ScrollView>
  );
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{query ? "Search" : filterLabel(filter)}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{query ? "Every app on this device" : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}</Text>
      </View>
      <NewButton t={t} onPress={() => void create()} />
    </View>
  );
  const undoBar = undo ? <UndoBar t={t} title={undo.title} onUndo={restore} /> : null;
  const editor = (footer: boolean, onBack?: () => void) =>
    selected ? (
      <Editor
        t={t}
        note={selected}
        people={people}
        links={links}
        onBack={onBack}
        onDelete={() => void remove(selected)}
        onOpenLink={(x) => void openLink(x)}
        onTag={tagFilter}
        footer={footer ? <View style={{ marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderColor: c.border }}><Connected t={t} note={selected} links={links} onOpenNote={(n) => void open(n.id)} /></View> : undefined}
      />
    ) : (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg, padding: space.xl }}>
        <Text style={{ color: c.textMuted, fontSize: font.size.sm }}>Pick a note, or start a new one.</Text>
      </View>
    );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
        {desktop ? <Sidebar t={t} notes={all} filter={filter} onFilter={pickFilter} /> : null}
        <View style={{ width: desktop ? 340 : Math.min(340, width * 0.42), borderRightWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
          {header}
          <SearchBox t={t} value={query} onChange={setQuery} inputRef={searchRef} />
          {desktop ? null : <FilterChips t={t} notes={all} filter={filter} onFilter={pickFilter} />}
          <View style={{ flex: 1 }}>{listBody}</View>
        </View>
        {editor(!desktop)}
        {desktop && selected ? (
          <ScrollView style={{ width: 300, flexGrow: 0, borderLeftWidth: 1, borderColor: c.border, backgroundColor: c.surface }} contentContainerStyle={{ padding: space.lg }}>
            <Connected t={t} note={selected} links={links} onOpenNote={(n) => void open(n.id)} />
          </ScrollView>
        ) : null}
        {undoBar}
      </View>
    );
  }

  // Phone
  if (selected) return <View style={{ flex: 1 }}>{editor(true, () => void open(undefined))}{undoBar}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <SearchBox t={t} value={query} onChange={setQuery} inputRef={searchRef} />
      {query ? null : <FilterChips t={t} notes={all} filter={filter} onFilter={pickFilter} />}
      <View style={{ flex: 1 }}>{listBody}</View>
      {undoBar}
    </View>
  );
}

function NewButton({ t, onPress }: { t: Theme; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New note"
      onPress={onPress}
      style={{ height: 40, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: t.accent }}
    >
      <Text style={{ color: t.n.onAccent, fontSize: font.size.sm, fontWeight: "700" }}>+ New</Text>
    </Pressable>
  );
}

function UndoBar({ t, title, onUndo }: { t: Theme; title: string; onUndo: () => void }) {
  const { c } = t;
  return (
    <View accessibilityLiveRegion="polite" style={{ position: "absolute", left: space.lg, right: space.lg, bottom: space.lg, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingLeft: space.lg, paddingRight: space.sm, minHeight: 48, borderRadius: radius.md, backgroundColor: c.text, maxWidth: 480 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: c.bg, fontSize: font.size.sm }}>{`Deleted “${title || "Untitled"}”`}</Text>
        <Pressable accessibilityRole="button" onPress={onUndo} style={{ minHeight: 40, paddingHorizontal: space.md, justifyContent: "center" }}>
          <Text style={{ color: t.accent, fontSize: font.size.sm, fontWeight: "700" }}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}
