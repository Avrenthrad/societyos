import type { Person } from "@societyos/core";
import { formatAddress, parseAddressList, type Address, type Draft, type MailState } from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Theme } from "../theme";
import { Button, Menu, MenuItem } from "./ui";

const join = (a: Address[]) => a.map(formatAddress).join(", ");

/** Everyone you've emailed or heard from, plus People, for the To field. */
function useContacts(state: MailState, people: Person[]) {
  return useMemo(() => {
    const map = new Map<string, Address>();
    for (const p of people) for (const e of p.emails) map.set(e.toLowerCase(), { name: p.name, email: e.toLowerCase() });
    const mine = new Set(state.accounts.map((a) => a.email.toLowerCase()));
    for (const m of state.messages) {
      for (const a of [m.from, ...m.to, ...m.cc]) {
        if (!mine.has(a.email) && !map.has(a.email) && !/no-?reply|notifications?@/i.test(a.email)) map.set(a.email, a);
      }
    }
    return [...map.values()];
  }, [state.messages, state.accounts, people]);
}

export function Compose({ t, wide, state, people, draft, onSend, onSaveDraft, onDiscard }: {
  t: Theme;
  wide: boolean;
  state: MailState;
  people: Person[];
  draft: Draft;
  onSend: (d: Draft) => void;
  onSaveDraft: (d: Draft) => void;
  onDiscard: (d: Draft) => void;
}) {
  const { c } = t;
  const [to, setTo] = useState(join(draft.to));
  const [cc, setCc] = useState(join(draft.cc));
  const [bcc, setBcc] = useState(join(draft.bcc));
  const [showCc, setShowCc] = useState(draft.cc.length + draft.bcc.length > 0);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [accountId, setAccountId] = useState(draft.accountId);
  const [pickFrom, setPickFrom] = useState(false);
  const [focus, setFocus] = useState<"to" | "cc" | "bcc" | undefined>();
  const contacts = useContacts(state, people);
  const account = state.accounts.find((a) => a.id === accountId);

  const current = (): Draft => ({ ...draft, accountId, to: parseAddressList(to), cc: parseAddressList(cc), bcc: parseAddressList(bcc), subject, body });
  const recipients = parseAddressList(to).length + parseAddressList(cc).length + parseAddressList(bcc).length;

  const fieldValue = { to, cc, bcc };
  const setField = { to: setTo, cc: setCc, bcc: setBcc };
  const typing = focus ? fieldValue[focus].split(/[,;]/).pop()!.trim().toLowerCase() : "";
  const suggestions = typing.length >= 1
    ? contacts.filter((a) => a.email.includes(typing) || a.name?.toLowerCase().includes(typing)).slice(0, 5)
    : [];
  const pick = (a: Address) => {
    if (!focus) return;
    const parts = fieldValue[focus].split(/[,;]/);
    parts.pop();
    setField[focus]([...parts.map((p) => p.trim()).filter(Boolean), formatAddress(a)].join(", ") + ", ");
  };

  const field = (key: "to" | "cc" | "bcc", label: string, value: string, set: (s: string) => void, extra?: React.ReactNode) => (
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: c.border }}>
      <Text style={{ width: 56, color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={set}
        onFocus={() => setFocus(key)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoFocus={key === "to" && !value}
        style={{ flex: 1, minHeight: 44, color: c.text, fontSize: font.size.sm }}
      />
      {extra}
    </View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: c.bg, borderRadius: wide ? radius.lg : 0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderBottomWidth: 1, borderColor: c.border }}>
        <Text accessibilityRole="header" style={{ flex: 1, color: c.text, fontWeight: "700", fontSize: font.size.md }}>
          {draft.threadId ? (subject.startsWith("Fwd") ? "Forward" : "Reply") : "New message"}
        </Text>
        <Button t={t} small kind="plain" label="Discard" onPress={() => onDiscard(current())} />
        <Button t={t} small label="Save draft" a11y="Save draft and close" onPress={() => onSaveDraft(current())} />
        <Button t={t} small kind="primary" label="Send" a11y="Send (Ctrl+Enter)" disabled={!recipients} onPress={() => onSend(current())} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.md, flexGrow: 1 }}>
        {state.accounts.length > 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`From ${account?.email}. Change`} onPress={() => setPickFrom(true)} style={{ flexDirection: "row", alignItems: "center", minHeight: 44, borderBottomWidth: 1, borderColor: c.border }}>
            <Text style={{ width: 56, color: c.textMuted, fontSize: 13 }}>From</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: account?.color, marginRight: space.sm }} />
            <Text style={{ flex: 1, color: c.text, fontSize: font.size.sm }}>{account?.email}</Text>
            <Text style={{ color: c.textMuted }}>▾</Text>
          </Pressable>
        ) : null}
        {field("to", "To", to, setTo, showCc ? null : <Button t={t} small kind="plain" label="Cc Bcc" a11y="Add Cc or Bcc" onPress={() => setShowCc(true)} />)}
        {showCc ? field("cc", "Cc", cc, setCc) : null}
        {showCc ? field("bcc", "Bcc", bcc, setBcc) : null}
        {suggestions.length ? (
          <View style={{ borderBottomWidth: 1, borderColor: c.border, paddingVertical: 4 }}>
            {suggestions.map((a) => (
              <Pressable key={a.email} accessibilityRole="button" onPress={() => pick(a)} style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: pressed ? c.surface : "transparent" })}>
                <Text style={{ color: c.text, fontSize: 13 }}>
                  {a.name ?? a.email} <Text style={{ color: c.textMuted }}>{a.name ? a.email : ""}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: c.border }}>
          <Text style={{ width: 56, color: c.textMuted, fontSize: 13 }}>Subject</Text>
          <TextInput accessibilityLabel="Subject" value={subject} onChangeText={setSubject} onFocus={() => setFocus(undefined)} style={{ flex: 1, minHeight: 44, color: c.text, fontSize: font.size.sm }} />
        </View>
        <TextInput
          accessibilityLabel="Message"
          value={body}
          onChangeText={setBody}
          onFocus={() => setFocus(undefined)}
          multiline
          autoFocus={!!draft.to.length}
          placeholder="Write your message"
          placeholderTextColor={c.textMuted}
          onKeyPress={(e) => {
            const ne = e.nativeEvent as { key: string; ctrlKey?: boolean; metaKey?: boolean };
            if (ne.key === "Enter" && (ne.ctrlKey || ne.metaKey) && recipients) onSend(current());
          }}
          style={{ flex: 1, minHeight: 260, paddingVertical: space.md, color: c.text, fontSize: font.size.sm, lineHeight: 21, textAlignVertical: "top" }}
        />
      </ScrollView>
      <Menu t={t} visible={pickFrom} title="Send from" onClose={() => setPickFrom(false)}>
        {state.accounts.map((a) => (
          <MenuItem key={a.id} t={t} label={a.email} detail={a.name} checked={a.id === accountId} onPress={() => { setAccountId(a.id); setPickFrom(false); }} />
        ))}
      </Menu>
    </View>
  );

  return (
    <Modal visible transparent={wide} animationType={wide ? "fade" : "slide"} onRequestClose={() => onSaveDraft(current())}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: wide ? "rgba(0,0,0,0.3)" : c.bg, alignItems: wide ? "center" : "stretch", justifyContent: "center", padding: wide ? space.xl : 0 }}>
        <View style={{ flex: wide ? undefined : 1, width: "100%", maxWidth: wide ? 720 : undefined, height: wide ? "85%" : undefined }}>{content}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
