import type { Task } from "@societyos/core";
import { completeTask, formatDay, setStatus, type DayAgenda } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { Pressable, Text, View } from "react-native";
import { store } from "../store";
import type { Theme } from "../theme";
import { Checkbox } from "./Checkbox";

/** Tasks with no time yet. Tap one, then tap a time on the day to place it. */
export function ToSchedule({ t, agenda, selectedId, onSelect, now }: {
  t: Theme;
  agenda: DayAgenda;
  selectedId?: string;
  onSelect: (task: Task) => void;
  now: Date;
}) {
  const { c } = t;
  const groups = [
    { label: "Overdue, rolled to today", color: c.danger, items: agenda.toSchedule.overdue },
    { label: "No time yet", color: c.textMuted, items: agenda.toSchedule.due },
  ].filter((g) => g.items.length);

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: font.size.md, fontWeight: "700" }}>To schedule</Text>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>Tap a task, then tap a time on the day.</Text>
      </View>
      {groups.length === 0 ? <Text style={{ color: c.textMuted, fontSize: 13 }}>Nothing waiting for a time.</Text> : null}
      {groups.map((g) => (
        <View key={g.label} style={{ gap: space.sm }}>
          <Text style={{ color: g.color, fontSize: font.size.xs, fontWeight: "600" }}>{g.label}</Text>
          {g.items.map((task) => {
            const selected = task.id === selectedId;
            return (
              <Pressable
                key={task.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${task.title}. ${selected ? "Selected, tap a time to place it" : "Tap to pick a time"}`}
                onPress={() => onSelect(task)}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: space.md,
                  padding: space.md,
                  borderRadius: radius.md,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? c.accent : c.border,
                  backgroundColor: c.bg,
                }}
              >
                <Checkbox checked={false} label={`Done: ${task.title}`} color={t.b.task.border} onToggle={() => completeTask(store, task)} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: c.text, fontSize: font.size.sm, fontWeight: "500" }}>{task.title}</Text>
                  <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>
                    {[task.dueAt ? `Due ${formatDay(new Date(task.dueAt), now)}` : null, task.projectId].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {agenda.done.length ? (
        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>Done today</Text>
          {agenda.done.map((task) => (
            <View key={task.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, minHeight: 36 }}>
              <Checkbox
                checked={task.status === "done"}
                label={`Not done: ${task.title}`}
                color={t.b.task.border}
                onToggle={() => task.status === "done" && setStatus(store, task, "open")}
              />
              <Text style={{ color: c.textMuted, fontSize: font.size.sm, textDecorationLine: "line-through" }}>{task.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
