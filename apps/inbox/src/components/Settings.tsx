import { createLabel, type MailState } from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { canConnect, clientIds, connect, disconnect, redirectUri, saveClientIds, syncAccount, type Connectable } from "../accounts";
import { mailbox } from "../store";
import type { Theme } from "../theme";
import { showToast } from "../useMail";
import { Button, shortDate } from "./ui";

const LABEL_COLOURS = ["#EF6C00", "#8E24AA", "#00897B", "#1E88E5", "#D93025", "#188038", "#546E7A"];

export function Settings({ t, state, wide, onClose }: { t: Theme; state: MailState; wide: boolean; onClose: () => void }) {
  const { c } = t;
  const [ids, setIds] = useState(clientIds());
  const [busy, setBusy] = useState<string>();
  const [label, setLabel] = useState("");
  const [signature, setSignature] = useState(state.signature);
  const now = new Date();

  const doConnect = async (p: Connectable) => {
    setBusy(p);
    try {
      await connect(p);
      showToast(`${p === "outlook" ? "Outlook" : "Gmail"} connected`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const section = (title: string, children: React.ReactNode, note?: string) => (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontWeight: "700", fontSize: font.size.md }}>{title}</Text>
      {note ? <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>{note}</Text> : null}
      {children}
    </View>
  );
  const input = (label: string, value: string, set: (s: string) => void, opts: { multiline?: boolean; placeholder?: string } = {}) => (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={set}
      placeholder={opts.placeholder ?? label}
      placeholderTextColor={c.textMuted}
      multiline={opts.multiline}
      autoCapitalize="none"
      autoCorrect={false}
      style={{ minHeight: opts.multiline ? 80 : 40, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.sm, textAlignVertical: "top" }}
    />
  );
  const samples = state.accounts.filter((a) => a.provider === "demo");
  const real = state.accounts.filter((a) => a.provider !== "demo");

  return (
    <Modal visible transparent={wide} animationType={wide ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: wide ? "rgba(0,0,0,0.3)" : c.bg, alignItems: "center", justifyContent: "center", padding: wide ? space.xl : 0 }}>
        <View style={{ flex: wide ? undefined : 1, width: "100%", maxWidth: wide ? 640 : undefined, height: wide ? "88%" : undefined, backgroundColor: c.bg, borderRadius: wide ? radius.lg : 0, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: space.md, borderBottomWidth: 1, borderColor: c.border }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: c.text, fontSize: font.size.lg, fontWeight: "700" }}>Accounts and settings</Text>
            <Button t={t} small label="Done" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }}>
            {section(
              "Your accounts",
              <View style={{ gap: space.sm }}>
                {real.map((a) => (
                  <View key={a.id} style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: a.color }} />
                      <Text style={{ flex: 1, color: c.text, fontWeight: "600" }}>{a.email}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 12 }}>{a.provider === "outlook" ? "Outlook" : a.provider === "gmail" ? "Gmail" : "IMAP"}</Text>
                    </View>
                    <Text style={{ color: a.error ? c.danger : c.textMuted, fontSize: 12 }}>
                      {a.error ? a.error : a.lastSyncAt ? `Up to date · ${shortDate(a.lastSyncAt, now)}` : "Not synced yet"}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                      <Button t={t} small label="Sync now" onPress={() => syncAccount(a)} />
                      {a.error && canConnect() ? <Button t={t} small kind="primary" label="Sign in again" onPress={() => connect(a.provider as Connectable, a).catch((e) => showToast(String(e)))} /> : null}
                      <Button t={t} small kind="plain" label="Remove" onPress={() => disconnect(a)} />
                    </View>
                  </View>
                ))}
                {!real.length ? <Text style={{ color: c.textMuted, fontSize: 13 }}>No real accounts yet. You're looking at sample mail.</Text> : null}
                {canConnect() ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                    <Button t={t} kind="primary" label={busy === "outlook" ? "Waiting for Microsoft…" : "Connect Outlook / Microsoft 365"} disabled={!ids.outlook || !!busy} onPress={() => doConnect("outlook")} />
                    <Button t={t} kind="primary" label={busy === "gmail" ? "Waiting for Google…" : "Connect Gmail"} disabled={!ids.gmail || !!busy} onPress={() => doConnect("gmail")} />
                  </View>
                ) : (
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>Connect accounts from the web app for now.</Text>
                )}
                {!ids.outlook || !ids.gmail ? (
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>
                    {!ids.outlook && !ids.gmail ? "Outlook and Gmail need" : !ids.outlook ? "Outlook needs" : "Gmail needs"} a one-time app registration first (see "App ids" below).
                  </Text>
                ) : null}
                <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: c.surface }}>
                  <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>iCloud, Yahoo, Fastmail and other IMAP mail</Text>
                  <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>Coming next. IMAP needs a small SocietyOS server, because browsers can't talk to mail servers directly.</Text>
                </View>
              </View>,
            )}

            {samples.length
              ? section(
                  "Sample mail",
                  <Button
                    t={t}
                    label="Remove sample accounts"
                    onPress={() => {
                      for (const a of samples) disconnect(a);
                      showToast("Sample mail removed");
                    }}
                    style={{ alignSelf: "flex-start" }}
                  />,
                  "The sample accounts show what Inbox can do. Remove them once your own mail is connected.",
                )
              : null}

            {section(
              "Labels",
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>{input("New label", label, setLabel)}</View>
                <Button
                  t={t}
                  label="Add"
                  disabled={!label.trim()}
                  onPress={() => {
                    mailbox.set(createLabel(mailbox.state, label, LABEL_COLOURS[mailbox.state.labels.length % LABEL_COLOURS.length]!));
                    setLabel("");
                  }}
                />
              </View>,
              state.labels.map((l) => l.name).join(", ") || undefined,
            )}

            {section(
              "Signature",
              <View style={{ gap: space.sm }}>
                {input("Signature", signature, setSignature, { multiline: true, placeholder: "Added to new replies" })}
                <Button t={t} small label="Save signature" onPress={() => { mailbox.set({ ...mailbox.state, signature }); showToast("Signature saved"); }} style={{ alignSelf: "flex-start" }} />
              </View>,
            )}

            {canConnect()
              ? section(
                  "App ids",
                  <View style={{ gap: space.sm }}>
                    <Text style={{ color: c.text, fontSize: 13 }}>Sign-in address to register: <Text selectable style={{ fontWeight: "700" }}>{redirectUri()}</Text></Text>
                    {input("Microsoft app (client) id", ids.outlook, (v) => setIds({ ...ids, outlook: v.trim() }))}
                    {input("Google OAuth client id", ids.gmail, (v) => setIds({ ...ids, gmail: v.trim() }))}
                    <Button t={t} small label="Save app ids" onPress={() => { saveClientIds(ids); showToast("App ids saved on this device"); }} style={{ alignSelf: "flex-start" }} />
                  </View>,
                  "Outlook and Gmail only let registered apps read mail. The ids are public (not passwords). Normally they're built in; paste them here to test before they are.",
                )
              : null}

            {section(
              "Privacy",
              <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>
                Mail and sign-in tokens stay on this device. Nothing goes to a SocietyOS server. Only emails you turn into a task, note or person are copied into your SocietyOS data. Remote images are blocked until you ask for them.
              </Text>,
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
