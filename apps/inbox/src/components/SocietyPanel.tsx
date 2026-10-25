import type { Note, Person, Task } from "@societyos/core";
import {
  addToPeople,
  detectDates,
  detectedStart,
  displayName,
  emailToTask,
  findPerson,
  madeFrom,
  threadToNote,
  type Address,
  type Detected,
  type MailState,
  type ThreadSummary,
} from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { base, mailbox, store } from "../store";
import type { Theme } from "../theme";
import { showToast, useStoreVersion } from "../useMail";
import { Button, longDate } from "./ui";

/** Every date in a thread, newest message first, without repeats. */
export function threadDates(thread: ThreadSummary): { msgId: string; d: Detected }[] {
  const seen = new Set<string>();
  const out: { msgId: string; d: Detected }[] = [];
  for (const m of [...thread.messages].reverse()) {
    if (m.location === "drafts") continue;
    for (const d of detectDates(`${m.subject}\n${m.body}`, new Date(m.date))) {
      // "today" on its own is just talk; a time makes it worth planning.
      if (/^(today|tonight)$/i.test(d.text.trim()) && !d.time) continue;
      const key = `${detectedStart(d).getTime()}:${d.deadline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ msgId: m.id, d });
    }
  }
  // "Friday" next to "Friday at 7pm": keep only the one with the time.
  const timedDays = new Set(out.filter((x) => x.d.time).map((x) => x.d.date.getTime()));
  return out.filter((x) => x.d.time || x.d.deadline || !timedDays.has(x.d.date.getTime())).slice(0, 6);
}

export function describeDetected(d: Detected) {
  const when = longDate(detectedStart(d), !!d.time);
  const end = d.durationMin ? ` for ${d.durationMin} min` : "";
  return d.deadline ? `Due ${when}` : `${when}${end}`;
}

const openToday = () => {
  if (typeof location !== "undefined") location.assign(location.pathname.replace(/inbox\/?[^/]*$/, ""));
};

/** Add a detected date (or no date) to Today as a task. */
export async function addToToday(state: MailState, msgId: string, when?: Detected) {
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg) return;
  const { task, state: next } = await emailToTask(store, mailbox.state, msg, base, { when });
  mailbox.set({ ...mailbox.state, shared: next.shared });
  const where = task.block ? `on ${longDate(new Date(task.block.startsAt))}` : task.dueAt ? `due ${longDate(new Date(task.dueAt), false)}` : "to plan";
  showToast(`Added to Today ${where}`, typeof location !== "undefined" ? { label: "Open Today", run: openToday } : undefined);
}

/** Where Inbox meets the rest of SocietyOS: dates, tasks, notes, people. */
export function SocietyPanel({ t, state, thread, people }: { t: Theme; state: MailState; thread: ThreadSummary; people: Person[] }) {
  const { c } = t;
  const v = useStoreVersion();
  const dates = useMemo(() => threadDates(thread), [thread]);
  const latest = [...thread.messages].reverse().find((m) => m.location !== "drafts") ?? thread.latest;
  const [made, setMade] = useState<(Task | Note)[]>([]);
  useEffect(() => {
    let live = true;
    madeFrom(store, state, thread.messages.map((m) => m.id)).then((x) => live && setMade(x));
    return () => {
      live = false;
    };
  }, [v, state.shared, thread.id]);

  const mine = new Set(state.accounts.map((a) => a.email.toLowerCase()));
  const others: Address[] = [];
  for (const m of thread.messages) {
    for (const a of [m.from, ...m.to, ...m.cc]) {
      if (!mine.has(a.email.toLowerCase()) && !others.some((o) => o.email === a.email)) others.push(a);
    }
  }

  const saveNote = async () => {
    const { state: next } = await threadToNote(store, mailbox.state, thread.messages.filter((m) => m.location !== "drafts"), base);
    mailbox.set({ ...mailbox.state, shared: next.shared });
    showToast("Saved to Notes");
  };

  const section = (label: string) => <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>;

  return (
    <View accessibilityLabel="SocietyOS" style={{ gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text style={{ color: c.text, fontWeight: "700", fontSize: font.size.sm }}>SocietyOS</Text>

      {dates.length ? (
        <View style={{ gap: space.sm }}>
          {section("Dates in this email")}
          {dates.map(({ msgId, d }) => (
            <View key={`${msgId}:${d.start}`} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>{describeDetected(d)}</Text>
                <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 12 }}>“{d.text}”</Text>
              </View>
              <Button t={t} small kind="suggest" label="Add to Today" a11y={`Add ${describeDetected(d)} to Today`} onPress={() => addToToday(state, msgId, d)} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        {section("Turn into")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Button t={t} small label="Task" a11y="Make a task in Today" onPress={() => addToToday(state, latest.id)} />
          <Button t={t} small label="Note" a11y="Save to Notes" onPress={saveNote} />
        </View>
      </View>

      {made.length ? (
        <View style={{ gap: 4 }}>
          {section("Made from this email")}
          {made.map((e) => (
            <Text key={e.id} style={{ color: c.text, fontSize: 13 }}>
              {e.type === "task" ? (e.status === "done" ? "✓ Task: " : "☐ Task: ") : "📝 Note: "}
              {e.title}
              {e.type === "task" && e.block ? `  ·  ${longDate(new Date(e.block.startsAt))}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {others.length ? (
        <View style={{ gap: space.sm }}>
          {section("People")}
          {others.slice(0, 6).map((a) => {
            const p = findPerson(people, a);
            return (
              <View key={a.email} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>{p?.name ?? displayName(a)}</Text>
                  <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 12 }}>{a.email}</Text>
                </View>
                {p ? (
                  <Text style={{ color: t.suggest.text, fontSize: 12, fontWeight: "600" }}>✓ In People</Text>
                ) : (
                  <Button
                    t={t}
                    small
                    label="Add to People"
                    a11y={`Add ${displayName(a)} to People`}
                    onPress={async () => {
                      await addToPeople(store, a, base);
                      showToast(`${displayName(a)} added to People`);
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
