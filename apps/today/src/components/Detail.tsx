import type { Task, TaskStatus } from "@societyos/core";
import {
  addMinutes,
  describeRRule,
  formatDay,
  formatRange,
  moveBlock,
  setStatus,
  skipOccurrence,
  unscheduleTask,
} from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { Pressable, Text, View } from "react-native";
import { store } from "../store";
import type { Theme } from "../theme";
import { useLinked } from "../useToday";

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "wont-do", label: "Won't do" },
];

export function Segmented<T extends string>({ t, value, options, onChange, label }: {
  t: Theme;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const { c } = t;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 36, paddingHorizontal: space.md, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.text : c.bg }}
          >
            <Text style={{ color: on ? c.bg : c.text, fontSize: 13, fontWeight: on ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SmallButton({ t, label, onPress, a11y }: { t: Theme; label: string; onPress: () => void; a11y?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={{ minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: t.c.border, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: t.c.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** One task: its status, time block, repeat and everything linked to it. */
export function Detail({ t, task, now, onClose }: { t: Theme; task: Task; now: Date; onClose?: () => void }) {
  const { c } = t;
  const linked = useLinked(task);
  const block = task.block && { start: new Date(task.block.startsAt), end: new Date(task.block.endsAt) };
  const rows: [string, string][] = [
    ["Time block", block ? `${formatDay(block.start, now)} ${formatRange(block.start, block.end)}` : "Not scheduled"],
    ["Due", task.dueAt ? formatDay(new Date(task.dueAt), now) : "No date"],
    ["Repeats", task.recurrence ? describeRRule(task.recurrence.rrule, task.recurrence.afterCompletion) : "Never"],
  ];
  if (task.projectId) rows.push(["List", task.projectId]);

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.b.task.border, fontSize: font.size.xs, fontWeight: "600" }}>Task</Text>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{task.title}</Text>
        </View>
        {onClose ? <SmallButton t={t} label="Close" onPress={onClose} /> : null}
      </View>

      <Segmented t={t} label="Status" value={task.status} options={STATUSES} onChange={(s) => setStatus(store, task, s)} />

      <View style={{ gap: space.sm }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", gap: space.md }}>
            <Text style={{ width: 84, color: c.textMuted, fontSize: 13 }}>{k}</Text>
            <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>{v}</Text>
          </View>
        ))}
      </View>

      {block ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <SmallButton t={t} label="− 15 min" a11y="Move 15 minutes earlier" onPress={() => moveBlock(store, task, addMinutes(block.start, -15))} />
          <SmallButton t={t} label="+ 15 min" a11y="Move 15 minutes later" onPress={() => moveBlock(store, task, addMinutes(block.start, 15))} />
          <SmallButton t={t} label="Remove time" onPress={() => unscheduleTask(store, task)} />
        </View>
      ) : null}
      {task.recurrence ? <SmallButton t={t} label="Skip this one" onPress={() => skipOccurrence(store, task)} /> : null}

      <Text style={{ padding: space.md, borderRadius: radius.sm, backgroundColor: c.surface, color: c.textMuted, fontSize: font.size.xs }}>
        One item, not a copy: move the block and this task's time changes everywhere.
      </Text>

      <View style={{ gap: space.sm }}>
        <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>Linked</Text>
        {linked.length === 0 ? <Text style={{ color: c.textMuted, fontSize: 13 }}>Nothing linked yet.</Text> : null}
        {linked.map((l) => (
          <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 40, paddingHorizontal: space.md, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm }}>
            <Text style={{ width: 52, color: c.textMuted, fontSize: 11, fontWeight: "600" }}>{l.kind}</Text>
            <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>{l.title}</Text>
          </View>
        ))}
        <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Linking from here arrives with the People and Notes apps.</Text>
      </View>
    </View>
  );
}
