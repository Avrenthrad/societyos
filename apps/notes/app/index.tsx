import { createEntity, type Note } from "@societyos/core";
import { colors, space, font, radius, appAccents } from "@societyos/ui";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View, useColorScheme } from "react-native";
import { ME, store } from "../src/store";

export default function NotesHome() {
  const c = colors[useColorScheme() === "dark" ? "dark" : "light"];
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const refresh = () => store.list("note").then(setNotes);
    refresh();
    return store.subscribe((ch) => ch.entity.type === "note" && refresh());
  }, []);

  const add = async () => {
    if (!draft.trim()) return;
    await store.put(
      createEntity("note", { ownerId: ME, sourceApp: "notes", title: draft.trim(), body: "", tags: [], pinned: false }),
    );
    setDraft("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.lg, gap: space.md }}>
      <Text style={{ color: c.text, fontSize: font.size.xl, fontWeight: font.weight.bold }}>Notes</Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="New note"
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.md }}
        />
        <Pressable onPress={add} style={{ backgroundColor: appAccents.notes, borderRadius: radius.md, padding: space.md }}>
          <Text style={{ fontWeight: font.weight.bold }}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}>
            <Text style={{ color: c.text, fontSize: font.size.md }}>{item.title}</Text>
          </View>
        )}
      />
    </View>
  );
}
