import type { Person } from "@societyos/core";
import {
  addBirthdayReminder, CADENCES, formatAgo, formatBirthday, formatDaysUntil, markCaughtUp, nextBirthday, parseBirthday,
  planCatchUp, type PersonActivity, type TimelineEntry,
} from "@societyos/people-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import { base, store } from "../store";
import type { Theme } from "../theme";
import { Avatar, Button, Chip, SectionTitle } from "./Bits";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND_LABEL: Record<TimelineEntry["kind"], string> = { event: "Event", task: "Task", note: "Note", message: "Message", transaction: "Money", file: "File" };
const KIND_MARK: Record<TimelineEntry["kind"], string> = { event: "◷", task: "✓", note: "✎", message: "✉", transaction: "$", file: "▤" };

function localTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Where Today lives on the web (People is served from /<base>/people/). */
function todayHref(): string | undefined {
  if (Platform.OS !== "web") return undefined;
  const path = (globalThis as { location?: Location }).location?.pathname ?? "/";
  return path.replace(/people\/?.*$/, "");
}

function Line({ t, label, children }: { t: Theme; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: t.c.border, alignItems: "flex-start" }}>
      <Text style={{ width: 110, color: t.c.textMuted, fontSize: font.size.sm }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function Entry({ t, e }: { t: Theme; e: TimelineEntry }) {
  const { c } = t;
  const time = `${DOW[e.at.getDay()]} ${e.at.getDate()} ${MON[e.at.getMonth()]!.slice(0, 3)}`;
  return (
    <View accessible accessibilityLabel={`${KIND_LABEL[e.kind]}: ${e.title}, ${time}${e.detail ? `, ${e.detail}` : ""}`} style={{ flexDirection: "row", gap: space.md, paddingVertical: space.sm }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: e.contact ? t.accentSoft : c.surface, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: e.contact ? t.accentText : c.textMuted, fontSize: 15 }}>{KIND_MARK[e.kind]}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: c.text, fontSize: font.size.sm, fontWeight: "500" }}>{e.title}</Text>
        <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 12 }}>
          {[time, e.detail ?? KIND_LABEL[e.kind], e.via === "mention" ? "Mentions them" : undefined].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </View>
  );
}

/** Past entries in month groups: "October 2026". */
function Past({ t, entries }: { t: Theme; entries: TimelineEntry[] }) {
  const groups: { label: string; items: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const label = `${MON[e.at.getMonth()]} ${e.at.getFullYear()}`;
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.label}>
          <Text style={{ color: t.c.textMuted, fontSize: 12, fontWeight: "600", marginTop: space.sm }}>{g.label}</Text>
          {g.items.map((e) => <Entry key={e.id} t={t} e={e} />)}
        </View>
      ))}
    </>
  );
}

function Field({ t, label, value, onChange, placeholder, multiline, hint }: {
  t: Theme;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  const { c } = t;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        multiline={multiline}
        style={{
          minHeight: multiline ? 88 : 44, paddingHorizontal: space.md, paddingVertical: multiline ? space.sm : 0, borderWidth: 1, borderColor: c.border,
          borderRadius: radius.md, backgroundColor: c.bg, color: c.text, fontSize: font.size.md, textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {hint ? <Text style={{ color: hint.startsWith("!") ? c.danger : c.textMuted, fontSize: 12 }}>{hint.replace(/^!/, "")}</Text> : null}
    </View>
  );
}

const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function EditForm({ t, person, onDone, onDeleted }: { t: Theme; person: Person; onDone: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(person.name);
  const [emails, setEmails] = useState(person.emails.join(", "));
  const [phones, setPhones] = useState(person.phones.join(", "));
  const [bday, setBday] = useState(person.birthday ? formatBirthday(person.birthday) : "");
  const [tags, setTags] = useState((person.tags ?? []).join(", "));
  const [notes, setNotes] = useState(person.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const parsedBday = bday.trim() ? parseBirthday(bday) : undefined;
  const bdayBad = !!bday.trim() && !parsedBday;

  const save = async () => {
    if (!name.trim() || bdayBad) return;
    const { birthday: _b, notes: _n, tags: _t, ...rest } = person;
    await store.put({
      ...rest,
      name: name.trim(),
      emails: list(emails),
      phones: list(phones),
      ...(parsedBday ? { birthday: parsedBday } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(list(tags).length ? { tags: list(tags).map((x) => x.replace(/^#/, "").toLowerCase()) } : {}),
    });
    onDone();
  };

  return (
    <View style={{ gap: space.md }}>
      <Field t={t} label="Name" value={name} onChange={setName} hint={name.trim() ? undefined : "!A name is needed"} />
      <Field t={t} label="Birthday" value={bday} onChange={setBday} placeholder="12 Mar, or 12/03/1990" hint={bdayBad ? "!Try 12 Mar or 12/03/1990" : parsedBday ? formatBirthday(parsedBday) : undefined} />
      <Field t={t} label="Emails" value={emails} onChange={setEmails} placeholder="Separate with commas" />
      <Field t={t} label="Phones" value={phones} onChange={setPhones} placeholder="Separate with commas" />
      <Field t={t} label="Groups" value={tags} onChange={setTags} placeholder="family, friends, work" />
      <Field t={t} label="Notes" value={notes} onChange={setNotes} multiline placeholder="Kids' names, likes, how you met…" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button t={t} primary label="Save" onPress={save} />
        <Button t={t} label="Cancel" onPress={onDone} />
        <View style={{ flex: 1 }} />
        <Button
          t={t}
          danger
          label={confirmDelete ? `Yes, delete ${person.name}` : "Delete"}
          onPress={async () => {
            if (!confirmDelete) return setConfirmDelete(true);
            await store.remove("person", person.id);
            onDeleted();
          }}
        />
      </View>
    </View>
  );
}

/** One person: what you know, keep-in-touch, and a timeline that fills itself from every app. */
export function PersonDetail({ t, person, activity, now, onClose, onDeleted }: {
  t: Theme;
  person: Person;
  activity?: PersonActivity;
  now: Date;
  onClose?: () => void;
  onDeleted: () => void;
}) {
  const { c } = t;
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string>();
  useEffect(() => {
    setEditing(false);
    setFlash(undefined);
  }, [person.id]);

  const next = person.birthday ? nextBirthday(person.birthday, now) : undefined;
  const past = activity?.past ?? [];
  const upcoming = activity?.upcoming ?? [];
  const today = todayHref();

  const setCadence = (days?: number) => {
    const { keepInTouchDays: _k, ...rest } = person;
    void store.put(days ? { ...rest, keepInTouchDays: days } : rest);
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        {onClose ? <Button t={t} small label="‹ People" a11y="Back to people" onPress={onClose} /> : null}
        <View style={{ flex: 1 }} />
        {!editing ? <Button t={t} small label="Edit" a11y={`Edit ${person.name}`} onPress={() => setEditing(true)} /> : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.sm }}>
        <Avatar name={person.name} size={64} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>{person.name}</Text>
          {person.tags?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{person.tags.map((x) => <Chip key={x} t={t} tone="accent" label={`#${x}`} />)}</View>
          ) : null}
        </View>
      </View>

      {editing ? (
        <View style={{ marginTop: space.md }}>
          <EditForm t={t} person={person} onDone={() => setEditing(false)} onDeleted={onDeleted} />
        </View>
      ) : (
        <>
          <View style={{ marginTop: space.md }}>
            <Line t={t} label="Birthday">
              {person.birthday && next ? (
                <Text style={{ color: c.text, fontSize: font.size.sm }}>
                  {formatBirthday(person.birthday)}
                  <Text style={{ color: c.textMuted }}>{` · ${formatDaysUntil(next.daysUntil)}${next.turning ? `, turns ${next.turning}` : ""}`}</Text>
                </Text>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setEditing(true)}>
                  <Text style={{ color: t.accentText, fontSize: font.size.sm }}>Add birthday</Text>
                </Pressable>
              )}
            </Line>
            <Line t={t} label="Last in touch">
              <Text style={{ color: c.text, fontSize: font.size.sm }}>{activity?.lastContact ? formatAgo(activity.lastContact, now).replace(/^./, (x) => x.toUpperCase()) : "Nothing yet"}</Text>
            </Line>
            <Line t={t} label="Keep in touch">
              <View accessibilityRole="radiogroup" accessibilityLabel="Keep in touch" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[{ days: 0, label: "Off" }, ...CADENCES].map((o) => {
                  const on = (person.keepInTouchDays ?? 0) === o.days;
                  return (
                    <Pressable
                      key={o.days}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setCadence(o.days || undefined)}
                      style={{ minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? t.accent : c.border, backgroundColor: on ? t.accentSoft : c.bg, justifyContent: "center" }}
                    >
                      <Text style={{ color: on ? t.accentText : c.text, fontSize: 13, fontWeight: on ? "600" : "400" }}>{o.days ? o.label.replace("Every ", "") : o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Line>
            {person.emails.length || person.phones.length ? (
              <Line t={t} label="Contact">
                {[...person.emails.map((e) => ({ v: e, url: `mailto:${e}` })), ...person.phones.map((p) => ({ v: p, url: `tel:${p.replace(/[^\d+]/g, "")}` }))].map((x) => (
                  <Pressable key={x.v} accessibilityRole="link" onPress={() => Linking.openURL(x.url)} style={{ minHeight: 28, justifyContent: "center" }}>
                    <Text style={{ color: t.accentText, fontSize: font.size.sm }}>{x.v}</Text>
                  </Pressable>
                ))}
              </Line>
            ) : null}
            {person.notes ? (
              <Line t={t} label="Notes">
                <Text style={{ color: c.text, fontSize: font.size.sm }}>{person.notes}</Text>
              </Line>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md }}>
            <Button t={t} primary label="Caught up today" a11y={`Caught up with ${person.name} today`} onPress={async () => {
              await markCaughtUp(store, person, now);
              setFlash("Logged. Reminders count from today.");
            }} />
            <Button t={t} label="Plan a catch-up" onPress={async () => {
              await planCatchUp(store, person, base, now);
              setFlash(`“Catch up with ${person.name}” is on Today.`);
            }} />
            {person.birthday ? (
              <Button t={t} label="Birthday reminder" a11y={`Add a yearly birthday reminder for ${person.name} to Today`} onPress={async () => {
                await addBirthdayReminder(store, person, base, localTz(), now);
                setFlash("A yearly birthday reminder is on Today.");
              }} />
            ) : null}
          </View>
          {flash ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center", padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: t.accentSoft }}>
              <Text style={{ color: t.accentText, fontSize: 13 }}>{flash}</Text>
              {today && flash.includes("Today") ? (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(today)}>
                  <Text style={{ color: t.accentText, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" }}>Open Today</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {upcoming.length ? (
            <>
              <SectionTitle t={t} count={upcoming.length}>Coming up</SectionTitle>
              {upcoming.map((e) => <Entry key={e.id} t={t} e={e} />)}
            </>
          ) : null}
          <SectionTitle t={t} count={past.length}>Timeline</SectionTitle>
          {past.length ? (
            <Past t={t} entries={past} />
          ) : (
            <Text style={{ color: c.textMuted, fontSize: font.size.sm, lineHeight: 20 }}>
              This fills itself. Events {person.name.split(" ")[0]} is invited to, tasks and notes that mention them, emails and money linked to them all appear here.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
