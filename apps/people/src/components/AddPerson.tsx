import { createEntity, type Person } from "@societyos/core";
import { findPerson, parsePersonQuickAdd, type PersonQuickAdd } from "@societyos/people-logic";
import { font, radius, space } from "@societyos/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { base, store } from "../store";
import type { Theme } from "../theme";
import { Chip } from "./Bits";

/** Put an undone chip's words back into the name instead. */
function withoutTokens(q: PersonQuickAdd, undone: string[]): PersonQuickAdd {
  if (!undone.length) return q;
  const out: PersonQuickAdd = { ...q, emails: [...q.emails], phones: [...q.phones], tags: [...q.tags], tokens: [] };
  const extra: string[] = [];
  for (const tok of q.tokens) {
    if (!undone.includes(tok.text)) {
      out.tokens.push(tok);
      continue;
    }
    extra.push(tok.text);
    if (tok.kind === "birthday") out.birthday = undefined;
    if (tok.kind === "keep-in-touch") out.keepInTouchDays = undefined;
    if (tok.kind === "email") out.emails = out.emails.filter((e) => e !== tok.text);
    if (tok.kind === "phone") out.phones = out.phones.filter((p) => p !== tok.text);
    if (tok.kind === "tag") out.tags = out.tags.filter((x) => `#${x}` !== tok.text.toLowerCase());
  }
  out.name = [q.name, ...extra].filter(Boolean).join(" ");
  return out;
}

/**
 * Add someone in one line: "Sam Lee bday 12 Mar every 2 weeks #friends".
 * What was understood shows as chips before saving; × keeps those words
 * as part of the name instead.
 */
export function AddPerson({ t, people, onAdded, compact }: { t: Theme; people: Person[]; onAdded: (p: Person) => void; compact?: boolean }) {
  const { c } = t;
  const [text, setText] = useState("");
  const [undone, setUndone] = useState<string[]>([]);
  const parsed = useMemo(() => withoutTokens(parsePersonQuickAdd(text), undone), [text, undone]);
  const existing = parsed.name ? findPerson(people, { name: parsed.name, email: parsed.emails[0] }) : undefined;

  const add = async () => {
    if (!parsed.name) return;
    if (existing) {
      onAdded(existing);
    } else {
      const p = createEntity("person", {
        ...base,
        name: parsed.name,
        emails: parsed.emails,
        phones: parsed.phones,
        ...(parsed.birthday ? { birthday: parsed.birthday } : {}),
        ...(parsed.keepInTouchDays ? { keepInTouchDays: parsed.keepInTouchDays } : {}),
        ...(parsed.tags.length ? { tags: parsed.tags } : {}),
      });
      await store.put(p);
      onAdded(p);
    }
    setText("");
    setUndone([]);
  };

  return (
    <View style={{ gap: space.xs, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <TextInput
          accessibilityLabel="Add a person"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setUndone([]);
          }}
          onSubmitEditing={add}
          placeholder={compact ? "Add: Sam Lee bday 12 Mar monthly" : "Add someone: Sam Lee bday 12 Mar every 2 weeks #friends"}
          placeholderTextColor={c.textMuted}
          returnKeyType="done"
          autoCapitalize="words"
          style={{
            flex: 1, minWidth: 0, height: 44, paddingHorizontal: space.md, borderWidth: 1,
            borderColor: text ? t.accent : c.border, borderRadius: compact ? radius.pill : radius.md,
            backgroundColor: compact ? c.surface : c.bg, color: c.text, fontSize: font.size.md,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={existing ? `Open ${existing.name}` : "Add person"}
          onPress={add}
          style={{ height: 44, minWidth: 44, paddingHorizontal: compact ? 0 : space.lg, borderRadius: compact ? radius.pill : radius.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: t.onAccent, fontWeight: "700", fontSize: compact ? 22 : font.size.sm }}>{compact ? "+" : existing ? "Open" : "Add"}</Text>
        </Pressable>
      </View>
      {text.trim() ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {existing ? (
            <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Already in People: {existing.name}</Text>
          ) : parsed.tokens.length ? (
            <>
              <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{parsed.name ? `${parsed.name}:` : "Understood as:"}</Text>
              {parsed.tokens.map((tok) => (
                <Chip key={tok.text} t={t} tone="accent" label={tok.label} onRemove={() => setUndone((xs) => [...xs, tok.text])} />
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
