import { createEntity, type Person, type Place, type Transaction } from "@societyos/core";
import { parseMoneyEntry, saveEntry } from "@societyos/finance-logic";
import { font, radius, space } from "@societyos/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { attachReceipt, canAttach, pickFile } from "../files";
import { CURRENCY, OWNER, store } from "../store";
import type { Theme } from "../theme";

/**
 * Type a spend in plain words ("Coffee 4.50 at Bean Co"). What was
 * understood shows as chips before saving; tap × to keep those words as
 * text. Anything with a repeat ("every month on the 1st") is saved as a
 * bill, which adds its reminder to Today.
 */
export function QuickEntry({ t, people, places, compact, onSaved }: {
  t: Theme;
  people: Person[];
  places: Place[];
  compact?: boolean;
  onSaved?: (r: { kind: "transaction" | "bill"; id: string; open?: boolean }) => void;
}) {
  const { c, f } = t;
  const [text, setText] = useState("");
  const [ignore, setIgnore] = useState<number[]>([]);
  const [note, setNote] = useState<string>();
  const entry = useMemo(
    () =>
      parseMoneyEntry(text, {
        currency: CURRENCY,
        people: people.map((p) => ({ id: p.id, name: p.name })),
        places: places.map((p) => ({ id: p.id, name: p.name })),
        ignore,
      }),
    [text, ignore, people, places],
  );
  const ready = entry.amountMinor !== undefined;

  const reset = () => {
    setText("");
    setIgnore([]);
  };

  const save = async (): Promise<Transaction | undefined> => {
    if (!ready) {
      setNote(text.trim() ? "Add an amount, e.g. 4.50" : undefined);
      return undefined;
    }
    const r = await saveEntry(store, entry, OWNER, CURRENCY);
    reset();
    if (r.kind === "bill") {
      setNote(`Bill saved. “${r.task.title}” is now in Today.`);
      onSaved?.({ kind: "bill", id: r.bill.id });
      return undefined;
    }
    setNote(undefined);
    onSaved?.({ kind: "transaction", id: r.transaction.id });
    return r.transaction;
  };

  /** Photo first: save what's typed (or a blank "Receipt" to fill in) and attach it. */
  const receipt = async () => {
    const file = await pickFile("image/*,application/pdf", true);
    if (!file) return;
    let tx = ready && !entry.recurrence ? await save() : undefined;
    if (!tx) {
      tx = createEntity("transaction", {
        ...OWNER,
        amountMinor: 0,
        currency: CURRENCY,
        occurredAt: entry.date.toISOString(),
        description: entry.description || "Receipt",
      });
      await store.put(tx);
      reset();
    }
    await attachReceipt(tx, file);
    onSaved?.({ kind: "transaction", id: tx.id, open: true });
  };

  const round = compact ? radius.pill : radius.md;
  return (
    <View style={{ gap: space.xs, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
      {compact ? null : <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>Add money</Text>}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <TextInput
          accessibilityLabel="Add a spend, income or bill"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setIgnore([]);
            setNote(undefined);
          }}
          onSubmitEditing={() => void save()}
          placeholder="e.g. Coffee 4.50 at Bean Co"
          placeholderTextColor={c.textMuted}
          returnKeyType="done"
          style={{ flex: 1, minWidth: 0, height: 44, paddingHorizontal: space.md, borderWidth: 1, borderColor: text ? f.accent : c.border, borderRadius: round, backgroundColor: compact ? c.surface : c.bg, color: c.text, fontSize: font.size.md }}
        />
        {canAttach() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a receipt photo"
            onPress={() => void receipt()}
            style={{ height: 44, minWidth: 44, paddingHorizontal: compact ? 0 : space.md, borderRadius: round, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}
          >
            <Text style={{ color: c.text, fontSize: compact ? 18 : font.size.sm }}>{compact ? "📷" : "Receipt"}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={entry.recurrence ? "Add bill" : "Add"}
          onPress={() => void save()}
          style={{ height: 44, minWidth: 44, paddingHorizontal: compact ? 0 : space.lg, borderRadius: round, backgroundColor: f.accent, alignItems: "center", justifyContent: "center", opacity: ready || !text ? 1 : 0.6 }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: compact ? 22 : font.size.sm }}>{compact ? "+" : entry.recurrence ? "Add bill" : "Add"}</Text>
        </Pressable>
      </View>
      {entry.tokens.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{entry.recurrence ? "Bill:" : "Understood as:"}</Text>
          {entry.tokens.map((tok) => (
            <View key={tok.start} style={{ flexDirection: "row", alignItems: "center", paddingLeft: space.sm, borderRadius: radius.pill, backgroundColor: f.accentSoft }}>
              <Text style={{ color: f.accentText, fontSize: font.size.xs, fontWeight: "500" }}>{tok.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Undo ${tok.label}`}
                hitSlop={8}
                onPress={() => setIgnore((xs) => [...xs, tok.start])}
                style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: f.accentText, fontSize: 14 }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {note ? <Text accessibilityLiveRegion="polite" style={{ color: c.textMuted, fontSize: font.size.xs }}>{note}</Text> : null}
    </View>
  );
}
