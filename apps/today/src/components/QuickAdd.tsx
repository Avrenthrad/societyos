import { createEntity, type Person } from "@societyos/core";
import { link } from "@societyos/sync";
import { localTz, parseQuickAdd, quickAddToTask } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { APP, ME, store } from "../store";
import type { Theme } from "../theme";

/**
 * Type a task in plain words. What was understood shows as chips before
 * saving; tap × on any chip to keep those words as plain text instead.
 */
export function QuickAdd({ t, people, compact }: { t: Theme; people: Person[]; compact?: boolean }) {
  const { c } = t;
  const [text, setText] = useState("");
  const [ignore, setIgnore] = useState<number[]>([]);
  const parsed = useMemo(
    () => parseQuickAdd(text, { people: people.map((p) => ({ id: p.id, name: p.name })), ignore }),
    [text, ignore, people],
  );

  const add = async () => {
    if (!parsed.title) return;
    const base = { ownerId: ME, sourceApp: APP };
    const task = createEntity("task", { ...base, ...quickAddToTask(parsed, localTz()) });
    await store.put(task);
    for (const id of parsed.personIds) {
      const p = people.find((x) => x.id === id);
      if (p) await link(store, task, p, "mentions", base);
    }
    setText("");
    setIgnore([]);
  };

  return (
    <View style={{ gap: space.xs, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
      {compact ? null : (
        <Text nativeID="qa-label" style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>Quick add</Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <TextInput
          accessibilityLabel="Quick add"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setIgnore([]);
          }}
          onSubmitEditing={add}
          placeholder="e.g. Call Sam tomorrow 3pm 30m"
          placeholderTextColor={c.textMuted}
          returnKeyType="done"
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            paddingHorizontal: space.md,
            borderWidth: 1,
            borderColor: text ? c.accent : c.border,
            borderRadius: compact ? radius.pill : radius.md,
            backgroundColor: compact ? c.surface : c.bg,
            color: c.text,
            fontSize: font.size.md,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add task"
          onPress={add}
          style={{ height: 44, minWidth: 44, paddingHorizontal: compact ? 0 : space.lg, borderRadius: compact ? radius.pill : radius.md, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: compact ? 22 : font.size.sm }}>{compact ? "+" : "Add"}</Text>
        </Pressable>
      </View>
      {parsed.tokens.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Understood as:</Text>
          {parsed.tokens.map((tok) => (
            <View key={tok.start} style={{ flexDirection: "row", alignItems: "center", paddingLeft: space.sm, borderRadius: radius.pill, backgroundColor: t.b.event.bg }}>
              <Text style={{ color: t.b.event.text, fontSize: font.size.xs, fontWeight: "500" }}>{tok.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Undo ${tok.label}`}
                hitSlop={8}
                onPress={() => setIgnore((xs) => [...xs, tok.start])}
                style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: t.b.event.text, fontSize: 14 }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
