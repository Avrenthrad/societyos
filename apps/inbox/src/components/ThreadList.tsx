import { displayName, type MailState, type Tab, type ThreadSummary, type View as MailView } from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import type { Theme } from "../theme";
import { Avatar, Button, Chip, shortDate } from "./ui";

const TITLES: Record<string, string> = {
  inbox: "Inbox",
  starred: "Starred",
  snoozed: "Snoozed",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  all: "All mail",
  spam: "Spam",
  trash: "Bin",
};

export function viewTitle(state: MailState, view: MailView) {
  if (view.query?.trim()) return "Search";
  if (view.labelId) return state.labels.find((l) => l.id === view.labelId)?.name ?? "Label";
  return TITLES[view.folder] ?? "Mail";
}

/** "Sam, You (3)": who's in the thread, newest sender first. */
function senders(state: MailState, t: ThreadSummary) {
  const mine = new Set(state.accounts.map((a) => a.email.toLowerCase()));
  const names = t.participants.slice(0, 3).map((p) => (mine.has(p.email.toLowerCase()) ? "You" : displayName(p).split(" ")[0]!));
  const label = t.participants.length === 1 && !mine.has(t.participants[0]!.email) ? displayName(t.participants[0]!) : names.join(", ");
  return t.messages.length > 1 ? `${label} (${t.messages.length})` : label;
}

export function ThreadList({ t, state, view, threads, now, selectedId, checked, counts, query, onQuery, onTab, onOpen, onCheck, onBulk, header }: {
  t: Theme;
  state: MailState;
  view: MailView;
  threads: ThreadSummary[];
  now: Date;
  selectedId?: string;
  checked: Set<string>;
  counts: { focused: number; other: number };
  query: string;
  onQuery: (q: string) => void;
  onTab: (tab: Tab) => void;
  onOpen: (id: string) => void;
  onCheck: (id: string) => void;
  onBulk: (action: "archive" | "trash" | "read" | "unread" | "clear" | "all") => void;
  /** Phone: menu button and title. */
  header?: React.ReactNode;
}) {
  const { c } = t;
  const multiAccount = state.accounts.length > 1 && !view.accountId;
  const showTabs = view.folder === "inbox" && !view.labelId && !query.trim();

  const top = (
    <View style={{ gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
      {header}
      <View style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.md, backgroundColor: c.surface, paddingHorizontal: space.md }}>
        <Text style={{ color: c.textMuted, fontSize: 15 }}>⌕</Text>
        <TextInput
          nativeID="inbox-search"
          accessibilityLabel="Search mail"
          value={query}
          onChangeText={onQuery}
          placeholder="Search mail  (from:  is:unread  has:attachment)"
          placeholderTextColor={c.textMuted}
          returnKeyType="search"
          style={{ flex: 1, minHeight: 40, paddingHorizontal: space.sm, color: c.text, fontSize: font.size.sm }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onQuery("")} style={{ padding: space.sm }}>
            <Text style={{ color: c.textMuted }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {checked.size ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          <Text style={{ color: c.text, fontWeight: "600", fontSize: 13, marginRight: space.sm }}>{checked.size} selected</Text>
          <Button t={t} small label="Archive" onPress={() => onBulk("archive")} />
          <Button t={t} small label="Delete" onPress={() => onBulk("trash")} />
          <Button t={t} small label="Read" a11y="Mark as read" onPress={() => onBulk("read")} />
          <Button t={t} small label="Unread" a11y="Mark as unread" onPress={() => onBulk("unread")} />
          <Button t={t} small kind="plain" label="All" a11y="Select all" onPress={() => onBulk("all")} />
          <Button t={t} small kind="plain" label="Clear" a11y="Clear selection" onPress={() => onBulk("clear")} />
        </View>
      ) : showTabs ? (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: space.lg }}>
          {(["focused", "other"] as const).map((tab) => {
            const on = (view.tab ?? "focused") === tab;
            const n = counts[tab];
            return (
              <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onTab(tab)} style={{ paddingVertical: 6, borderBottomWidth: 2, borderColor: on ? t.accent : "transparent" }}>
                <Text style={{ color: on ? c.text : c.textMuted, fontWeight: on ? "700" : "500", fontSize: 13 }}>
                  {tab === "focused" ? "Focused" : "Other"}
                  {n ? `  ${n}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: c.textMuted, fontSize: 12 }}>
          {query.trim() ? `${threads.length} result${threads.length === 1 ? "" : "s"}` : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {top}
      <FlatList
        data={threads}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={
          <View style={{ padding: space.xxl, alignItems: "center", gap: space.sm }}>
            <Text style={{ color: c.text, fontSize: font.size.md, fontWeight: "600" }}>{query.trim() ? "Nothing found" : view.folder === "inbox" ? "All done" : "Nothing here"}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, textAlign: "center" }}>
              {query.trim() ? "Try fewer words, or in:all to include everything." : view.folder === "inbox" ? "Your inbox is clear." : ""}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const on = item.id === selectedId;
          const isChecked = checked.has(item.id);
          const unread = item.unread;
          const draft = item.latest.location === "drafts";
          const who = item.participants[0] ?? item.latest.from;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${unread ? "Unread. " : ""}${senders(state, item)}. ${item.subject}. ${shortDate(item.latest.date, now)}`}
              accessibilityState={{ selected: on }}
              onPress={() => onOpen(item.id)}
              onLongPress={() => onCheck(item.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: space.md,
                paddingHorizontal: space.md,
                paddingVertical: space.md,
                borderBottomWidth: 1,
                borderColor: c.border,
                backgroundColor: on || isChecked ? t.tint : pressed ? c.surface : c.bg,
                borderLeftWidth: 3,
                borderLeftColor: unread ? t.accent : "transparent",
              })}
            >
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isChecked }} accessibilityLabel="Select" onPress={() => onCheck(item.id)} hitSlop={6}>
                <Avatar t={t} name={displayName(who)} email={who.email} selected={isChecked} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  {multiAccount ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: state.accounts.find((a) => a.id === item.latest.accountId)?.color ?? c.border }} /> : null}
                  <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: unread ? "700" : "500", fontSize: font.size.sm }}>
                    {draft ? <Text style={{ color: c.danger }}>Draft  </Text> : null}
                    {senders(state, item)}
                  </Text>
                  {item.hasAttachments ? <Text accessibilityLabel="Has attachment" style={{ color: c.textMuted, fontSize: 12 }}>📎</Text> : null}
                  {item.starred ? <Text accessibilityLabel="Starred" style={{ color: "#F4B400", fontSize: 13 }}>★</Text> : null}
                  <Text style={{ color: unread ? t.accent : c.textMuted, fontSize: 12, fontWeight: unread ? "700" : "400" }}>
                    {item.snoozedUntil && view.folder === "snoozed" ? `⏰ ${shortDate(item.snoozedUntil, now)}` : shortDate(item.latest.date, now)}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ color: c.text, fontWeight: unread ? "600" : "400", fontSize: 13 }}>{item.subject}</Text>
                <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 13 }}>{item.latest.body.replace(/\s+/g, " ").slice(0, 160)}</Text>
                {item.labels.length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                    {item.labels.map((id) => {
                      const l = state.labels.find((x) => x.id === id);
                      return l ? <Chip key={id} t={t} label={l.name} color={l.color} /> : null;
                    })}
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
