import type { Person } from "@societyos/core";
import {
  detectDates,
  displayName,
  draftFromMessage,
  snoozeOptions,
  threadOps,
  type Draft,
  type MailMessage,
  type MailState,
  type ThreadSummary,
} from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Theme } from "../theme";
import { act } from "../useMail";
import { MessageBody } from "./MessageBody";
import { addToToday, SocietyPanel } from "./SocietyPanel";
import { Avatar, Button, Chip, longDate, Menu, MenuItem, shortDate } from "./ui";

const size = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export function ThreadView({ t, state, thread, now, people, sidePanel, onBack, onReply, onEditDraft, onDone }: {
  t: Theme;
  state: MailState;
  thread: ThreadSummary;
  now: Date;
  people: Person[];
  /** Wide screens: SocietyOS panel to the right instead of above. */
  sidePanel: boolean;
  onBack?: () => void;
  onReply: (m: MailMessage, mode: "reply" | "replyAll" | "forward") => void;
  onEditDraft: (d: Draft) => void;
  /** Called after an action that removes the thread from view. */
  onDone: () => void;
}) {
  const { c } = t;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<"snooze" | "label" | "more" | undefined>();
  // Phones get the common actions; the rest sit under More.
  const compact = !!onBack;
  const ids = [thread.id];
  const latest = thread.messages[thread.messages.length - 1]!;
  const where = latest.location;
  const binned = thread.messages.every((m) => m.location === "trash" || m.location === "spam");

  // Opening a thread reads it; the newest and any unread messages start expanded.
  useEffect(() => {
    setOpen(new Set(thread.messages.filter((m, i) => !m.read || i === thread.messages.length - 1).map((m) => m.id)));
    if (thread.unread) act(threadOps.markRead(state, ids, true));
  }, [thread.id]);

  const run = (ops: ReturnType<typeof threadOps.archive>, msg: string, leaves = true) => {
    act(ops, msg);
    if (leaves) onDone();
  };

  const toolbar = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: c.border }}>
      {onBack ? <Button t={t} small kind="plain" label="‹ Back" a11y="Back to list" onPress={onBack} /> : null}
      {binned || where === "archive" ? (
        <Button t={t} small label="Move to inbox" onPress={() => run(threadOps.toInbox(state, ids), "Moved to inbox")} />
      ) : (
        <Button t={t} small label="Archive" a11y="Archive (e)" onPress={() => run(threadOps.archive(state, ids), "Archived")} />
      )}
      {binned ? (
        <Button t={t} small label="Delete forever" onPress={() => run(threadOps.deleteForever(state, ids), "Deleted forever")} />
      ) : (
        <Button t={t} small label="Delete" a11y="Delete (#)" onPress={() => run(threadOps.trash(state, ids), "Moved to bin")} />
      )}
      {!binned && !compact ? <Button t={t} small label="Spam" a11y="Report spam" onPress={() => run(threadOps.spam(state, ids), "Marked as spam")} /> : null}
      {thread.snoozedUntil ? (
        <Button t={t} small label="Unsnooze" onPress={() => run(threadOps.unsnooze(state, ids), "Back in your inbox", false)} />
      ) : (
        <Button t={t} small label="Snooze" onPress={() => setMenu("snooze")} />
      )}
      {compact ? null : <Button t={t} small label="Label" onPress={() => setMenu("label")} />}
      {compact ? null : <Button t={t} small label="Unread" a11y="Mark as unread" onPress={() => run(threadOps.markRead(state, ids, false), "Marked unread")} />}
      <Button
        t={t}
        small
        kind="plain"
        label={thread.starred ? "★" : "☆"}
        a11y={thread.starred ? "Unstar (s)" : "Star (s)"}
        onPress={() => act(threadOps.star(state, ids, !thread.starred))}
      />
      {compact ? <Button t={t} small kind="plain" label="More" a11y="More actions" onPress={() => setMenu("more")} /> : null}
    </View>
  );

  const messages = thread.messages.map((m) => {
    const expanded = open.has(m.id);
    const dates = expanded ? detectDates(m.body, new Date(m.date)) : [];
    const recipients = [...m.to, ...m.cc].map((a) => displayName(a)).join(", ");
    if (m.location === "drafts") {
      return (
        <Pressable key={m.id} accessibilityRole="button" onPress={() => onEditDraft(draftFromMessage(m))} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.danger }}>
          <Text style={{ color: c.danger, fontWeight: "600", fontSize: 13 }}>Draft · tap to keep writing</Text>
          <Text numberOfLines={2} style={{ color: c.textMuted, fontSize: 13 }}>{m.body || "(empty)"}</Text>
        </Pressable>
      );
    }
    return (
      <View key={m.id} style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setOpen((s) => {
            const n = new Set(s);
            if (n.has(m.id)) n.delete(m.id);
            else n.add(m.id);
            return n;
          })}
          style={{ flexDirection: "row", gap: space.md, padding: space.md }}
        >
          <Avatar t={t} name={displayName(m.from)} email={m.from.email} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "baseline" }}>
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: "700", fontSize: font.size.sm }}>
                {displayName(m.from)} <Text style={{ color: c.textMuted, fontWeight: "400", fontSize: 12 }}>{m.from.email}</Text>
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }} accessibilityLabel={longDate(new Date(m.date))}>{shortDate(m.date, now)}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 12 }}>{expanded ? `to ${recipients || "(nobody)"}` : m.body.replace(/\s+/g, " ")}</Text>
          </View>
        </Pressable>
        {expanded ? (
          <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.md }}>
            <MessageBody t={t} text={m.body} html={m.html} dates={dates} onDate={(d) => addToToday(state, m.id, d)} />
            {m.attachments.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {m.attachments.map((a) => (
                  <View key={a.id} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border }}>
                    <Text style={{ color: c.text, fontSize: 13 }}>📎 {a.name}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 11 }}>{size(a.sizeBytes)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Button t={t} small label="Reply" a11y="Reply (r)" onPress={() => onReply(m, "reply")} />
              {m.to.length + m.cc.length > 1 ? <Button t={t} small label="Reply all" a11y="Reply all (a)" onPress={() => onReply(m, "replyAll")} /> : null}
              <Button t={t} small label="Forward" a11y="Forward (f)" onPress={() => onReply(m, "forward")} />
            </View>
          </View>
        ) : null}
      </View>
    );
  });

  const panel = <SocietyPanel t={t} state={state} thread={thread} people={people} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {toolbar}
      <View style={{ flex: 1, flexDirection: "row" }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md, maxWidth: 860 }}>
          <View style={{ gap: space.sm }}>
            <Text accessibilityRole="header" selectable style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>{thread.subject}</Text>
            {thread.labels.length || thread.snoozedUntil ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {thread.snoozedUntil ? <Chip t={t} label={`Snoozed until ${longDate(new Date(thread.snoozedUntil))}`} /> : null}
                {thread.labels.map((id) => {
                  const l = state.labels.find((x) => x.id === id);
                  return l ? <Chip key={id} t={t} label={l.name} color={l.color} /> : null;
                })}
              </View>
            ) : null}
          </View>
          {sidePanel ? null : panel}
          {messages}
          <View style={{ height: space.xxl }} />
        </ScrollView>
        {sidePanel ? (
          <ScrollView style={{ width: 300, flexGrow: 0, borderLeftWidth: 1, borderColor: c.border }} contentContainerStyle={{ padding: space.md }}>
            {panel}
          </ScrollView>
        ) : null}
      </View>

      <Menu t={t} visible={menu === "snooze"} title="Snooze until" onClose={() => setMenu(undefined)}>
        {snoozeOptions(now).map((o) => (
          <MenuItem
            key={o.label}
            t={t}
            label={o.label}
            detail={longDate(o.until)}
            onPress={() => {
              setMenu(undefined);
              run(threadOps.snooze(state, ids, o.until), `Snoozed until ${longDate(o.until)}`);
            }}
          />
        ))}
      </Menu>
      <Menu t={t} visible={menu === "more"} title="More" onClose={() => setMenu(undefined)}>
        <MenuItem t={t} label="Label" onPress={() => setMenu("label")} />
        <MenuItem t={t} label="Mark as unread" onPress={() => { setMenu(undefined); run(threadOps.markRead(state, ids, false), "Marked unread"); }} />
        {!binned ? <MenuItem t={t} label="Report spam" onPress={() => { setMenu(undefined); run(threadOps.spam(state, ids), "Marked as spam"); }} /> : null}
      </Menu>
      <Menu t={t} visible={menu === "label"} title="Labels" onClose={() => setMenu(undefined)}>
        {state.labels.map((l) => {
          const on = thread.labels.includes(l.id);
          return <MenuItem key={l.id} t={t} label={l.name} checked={on} onPress={() => act(threadOps.label(state, ids, l.id, !on))} />;
        })}
        {!state.labels.length ? <Text style={{ color: c.textMuted, padding: space.sm }}>No labels yet. Add them in Settings.</Text> : null}
      </Menu>
    </View>
  );
}
