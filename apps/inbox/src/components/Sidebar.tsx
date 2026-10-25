import type { Counts, FolderId, MailState, View as MailView } from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Theme } from "../theme";
import { Button } from "./ui";

const FOLDERS: { id: FolderId; label: string; count?: keyof Counts }[] = [
  { id: "inbox", label: "Inbox", count: "inbox" },
  { id: "starred", label: "Starred", count: "starred" },
  { id: "snoozed", label: "Snoozed", count: "snoozed" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts", count: "drafts" },
  { id: "archive", label: "Archive" },
  { id: "all", label: "All mail" },
  { id: "spam", label: "Spam", count: "spam" },
  { id: "trash", label: "Bin" },
];

export function Sidebar({ t, state, view, counts, onView, onCompose, onSettings }: {
  t: Theme;
  state: MailState;
  view: MailView;
  counts: Counts;
  onView: (v: MailView) => void;
  onCompose: () => void;
  onSettings: () => void;
}) {
  const { c } = t;
  const row = (key: string, label: string, active: boolean, onPress: () => void, count?: number, dot?: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        minHeight: 38,
        paddingHorizontal: space.md,
        borderRadius: radius.sm,
        backgroundColor: active ? t.tint : pressed ? c.surface : "transparent",
      })}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, color: active ? t.tintText : c.text, fontWeight: active || count ? "600" : "400", fontSize: font.size.sm }}>{label}</Text>
      {count ? <Text style={{ color: active ? t.tintText : c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{count}</Text> : null}
    </Pressable>
  );
  const heading = (label: string) => (
    <Text style={{ marginTop: space.lg, marginBottom: 4, paddingHorizontal: space.md, color: c.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
  );
  const isFolder = (f: FolderId) => !view.labelId && view.folder === f;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.md, gap: 2 }}>
      <Button t={t} kind="primary" label="Compose" a11y="Compose new email" onPress={onCompose} style={{ marginBottom: space.md, minHeight: 44 }} />
      {FOLDERS.map((f) => row(f.id, f.label, isFolder(f.id), () => onView({ folder: f.id, accountId: view.accountId, tab: f.id === "inbox" ? view.tab ?? "focused" : undefined }), f.count ? (counts[f.count] as number) : undefined))}

      {state.labels.length ? heading("Labels") : null}
      {state.labels.map((l) => row(l.id, l.name, view.labelId === l.id, () => onView({ folder: "all", labelId: l.id, accountId: view.accountId }), counts.labels[l.id], l.color))}

      {state.accounts.length > 1 ? heading("Accounts") : null}
      {state.accounts.length > 1 ? row("all-accounts", "All accounts", !view.accountId, () => onView({ ...view, accountId: undefined })) : null}
      {state.accounts.length > 1
        ? state.accounts.map((a) => row(a.id, a.error ? `${a.name} · ${a.error}` : a.name, view.accountId === a.id, () => onView({ ...view, accountId: a.id }), undefined, a.color))
        : null}

      <View style={{ height: space.lg }} />
      {row("settings", "Accounts and settings", false, onSettings)}
      {row("today", "Open Today", false, () => {
        if (typeof location !== "undefined") location.assign(location.pathname.replace(/inbox\/?[^/]*$/, ""));
      })}
    </ScrollView>
  );
}
