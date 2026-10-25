import type { Task } from "@societyos/core";
import { addDays, addMinutes, DEFAULT_BLOCK_MIN, formatDay, sameDay, scheduleTask, startOfDay, weekDays, dayNames, monthNames, type TimelineItem } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Detail, Segmented } from "../src/components/Detail";
import { QuickAdd } from "../src/components/QuickAdd";
import { Timeline } from "../src/components/Timeline";
import { ToSchedule } from "../src/components/ToSchedule";
import { seedDemo, store } from "../src/store";
import { useTheme, type Theme } from "../src/theme";
import { useNow, useToday } from "../src/useToday";

let seeded = false;

/** Wide screens get list + day + details side by side; phones get one timeline. */
const WIDE = 900;

export default function TodayScreen() {
  const t = useTheme();
  const { c } = t;
  const now = useNow();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [selectedId, setSelectedId] = useState<string>();
  const [placingId, setPlacingId] = useState<string>();
  const [mode, setMode] = useState<"timeline" | "list">("timeline");
  const { agenda, counts, people } = useToday(day, now);

  useEffect(() => {
    if (!seeded) {
      seeded = true;
      seedDemo();
    }
  }, []);

  const allTasks = useMemo(() => {
    if (!agenda) return [];
    const fromTimeline = agenda.timeline.flatMap((i) => (i.kind === "task" ? [i.task] : []));
    return [...fromTimeline, ...agenda.toSchedule.overdue, ...agenda.toSchedule.due, ...agenda.done];
  }, [agenda]);
  const [selectedTask, setSelectedTask] = useState<Task>();
  useEffect(() => {
    if (!selectedId) return setSelectedTask(undefined);
    const found = allTasks.find((x) => x.id === selectedId);
    if (found) setSelectedTask(found);
    else store.get("task", selectedId).then(setSelectedTask);
  }, [selectedId, allTasks]);
  const placing = placingId ? allTasks.find((x) => x.id === placingId) : undefined;

  const pickUnscheduled = (task: Task) => {
    setSelectedId(task.id);
    setPlacingId((p) => (p === task.id ? undefined : task.id));
  };
  const pickItem = (item: TimelineItem) => {
    setPlacingId(undefined);
    setSelectedId(item.kind === "task" ? item.id : undefined);
  };
  const place = async (start: Date) => {
    if (!placing) return;
    await scheduleTask(store, placing, start, addMinutes(start, DEFAULT_BLOCK_MIN));
    setPlacingId(undefined);
  };

  if (!agenda) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const dateLine = `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.getDay()]} ${day.getDate()} ${monthNames[day.getMonth()]}`;
  const title = sameDay(day, now) ? "Today" : formatDay(day, now);
  const timeline = (
    <Timeline
      t={t}
      day={day}
      now={now}
      items={agenda.timeline}
      hourHeight={wide ? 56 : 48}
      selectedId={selectedId}
      placing={placing}
      onSelect={pickItem}
      onPlace={place}
    />
  );
  const placingHint = placing ? (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, padding: space.sm, paddingLeft: space.md, borderRadius: radius.sm, backgroundColor: t.b.task.bg }}>
      <Text style={{ flex: 1, color: t.b.task.text, fontSize: 13 }}>Tap a time to place “{placing.title}”</Text>
      <Pressable accessibilityRole="button" onPress={() => setPlacingId(undefined)} style={{ minHeight: 32, paddingHorizontal: space.md, justifyContent: "center" }}>
        <Text style={{ color: t.b.task.text, fontWeight: "600", fontSize: 13 }}>Cancel</Text>
      </Pressable>
    </View>
  ) : null;
  const allDay = agenda.allDay.length ? (
    <View style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: c.surface }}>
      <Text style={{ color: c.textMuted, fontWeight: "600", fontSize: 13 }}>All day</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{agenda.allDay.map((e) => e.title).join(", ")}</Text>
    </View>
  ) : null;

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg, paddingHorizontal: space.xl, paddingVertical: space.md, backgroundColor: c.bg, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ minWidth: 180, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{title}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{dateLine}</Text>
          </View>
          <QuickAdd t={t} people={people} />
          <DayPager t={t} day={day} onChange={setDay} />
        </View>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Nav t={t} counts={counts} />
          <ScrollView style={{ width: 340, flexGrow: 0, borderRightWidth: 1, borderColor: c.border }} contentContainerStyle={{ padding: space.lg }}>
            <ToSchedule t={t} agenda={agenda} selectedId={placingId} onSelect={pickUnscheduled} now={now} />
          </ScrollView>
          <View style={{ flex: 1, minWidth: 0, padding: space.lg, gap: space.md, backgroundColor: c.bg }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: space.sm }}>
              <Text style={{ color: c.text, fontSize: font.size.md, fontWeight: "700" }}>{`${dayNames[day.getDay()]} ${day.getDate()} ${monthNames[day.getMonth()]}`}</Text>
              <Legend t={t} />
            </View>
            {allDay}
            {placingHint}
            {timeline}
          </View>
          {selectedTask ? (
            <ScrollView style={{ width: 320, flexGrow: 0, borderLeftWidth: 1, borderColor: c.border, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg }}>
              <Detail t={t} task={selectedTask} now={now} onClose={() => setSelectedId(undefined)} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    );
  }

  // Phone
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>{dateLine}</Text>
      </View>
      <WeekStrip t={t} day={day} now={now} onPick={setDay} />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Segmented
          t={t}
          label="View"
          value={mode}
          onChange={setMode}
          options={[{ value: "timeline", label: "Timeline" }, { value: "list", label: "List" }]}
        />
      </View>
      {mode === "timeline" ? (
        <View style={{ flex: 1, paddingHorizontal: space.md, gap: space.sm }}>
          <Tray t={t} tasks={[...agenda.toSchedule.overdue, ...agenda.toSchedule.due]} overdue={agenda.toSchedule.overdue} placingId={placingId} onPick={pickUnscheduled} />
          {allDay}
          {placingHint}
          {timeline}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg }}>
          <ToSchedule t={t} agenda={agenda} selectedId={placingId} onSelect={(task) => { pickUnscheduled(task); setMode("timeline"); }} now={now} />
        </ScrollView>
      )}
      <View style={{ padding: space.md, borderTopWidth: 1, borderColor: c.border }}>
        <QuickAdd t={t} people={people} compact />
      </View>
      <Modal visible={!!selectedTask && !placing} transparent animationType="slide" onRequestClose={() => setSelectedId(undefined)}>
        <Pressable accessibilityLabel="Close details" onPress={() => setSelectedId(undefined)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} />
        <ScrollView style={{ maxHeight: "75%", backgroundColor: c.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }} contentContainerStyle={{ padding: space.lg }}>
          {selectedTask ? <Detail t={t} task={selectedTask} now={now} onClose={() => setSelectedId(undefined)} /> : null}
        </ScrollView>
      </Modal>
    </View>
  );
}

function Legend({ t }: { t: Theme }) {
  const swatch = (s: { bg: string; border: string }, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: s.bg, borderWidth: 1, borderColor: s.border }} />
      <Text style={{ color: t.c.textMuted, fontSize: font.size.xs }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {swatch(t.b.task, "Task block")}
      {swatch(t.b.event, "Event")}
    </View>
  );
}

function Nav({ t, counts }: { t: Theme; counts: { today: number; upcoming: number; inbox: number } }) {
  const { c } = t;
  const items = [
    { label: "Today", count: counts.today, active: true },
    { label: "Upcoming", count: counts.upcoming },
    { label: "Inbox", count: counts.inbox },
  ];
  return (
    <View accessibilityRole="menu" style={{ width: 200, padding: space.md, gap: 4, backgroundColor: c.bg, borderRightWidth: 1, borderColor: c.border }}>
      {items.map((n) => (
        <View
          key={n.label}
          accessibilityState={{ selected: !!n.active, disabled: !n.active }}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: n.active ? t.b.event.bg : "transparent" }}
        >
          <Text style={{ color: n.active ? t.b.event.text : c.text, fontWeight: n.active ? "600" : "400", fontSize: font.size.sm }}>{n.label}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{n.count}</Text>
        </View>
      ))}
      <Text style={{ marginTop: space.sm, paddingHorizontal: space.md, color: c.textMuted, fontSize: 11 }}>Upcoming and Inbox views are next.</Text>
    </View>
  );
}

function DayPager({ t, day, onChange }: { t: Theme; day: Date; onChange: (d: Date) => void }) {
  const btn = (label: string, a11y: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{ minWidth: 44, height: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: t.c.border, alignItems: "center", justifyContent: "center", backgroundColor: t.c.bg }}
    >
      <Text style={{ color: t.c.text, fontSize: font.size.sm, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {btn("‹", "Previous day", () => onChange(addDays(day, -1)))}
      {btn("Today", "Go to today", () => onChange(startOfDay(new Date())))}
      {btn("›", "Next day", () => onChange(addDays(day, 1)))}
    </View>
  );
}

function WeekStrip({ t, day, now, onPick }: { t: Theme; day: Date; now: Date; onPick: (d: Date) => void }) {
  const { c } = t;
  return (
    <View accessibilityLabel="Pick a day" style={{ flexDirection: "row", gap: 4, paddingHorizontal: space.md, paddingVertical: space.sm }}>
      {weekDays(day).map((d) => {
        const on = sameDay(d, day);
        const today = sameDay(d, now);
        return (
          <Pressable
            key={d.getTime()}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={formatDay(d, now)}
            onPress={() => onPick(d)}
            style={{ flex: 1, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: on ? c.text : c.bg }}
          >
            <Text style={{ fontSize: 11, color: on ? c.bg : c.textMuted }}>{dayNames[d.getDay()]}</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: on ? c.bg : today ? c.accent : c.text }}>{d.getDate()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Phone: tasks still waiting for a time, as chips. Tap one, then tap a time. */
function Tray({ t, tasks, overdue, placingId, onPick }: { t: Theme; tasks: Task[]; overdue: Task[]; placingId?: string; onPick: (task: Task) => void }) {
  const { c } = t;
  if (!tasks.length) return null;
  return (
    <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>{tasks.length} to schedule</Text>
        <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Tap one, then a time</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {tasks.map((task) => {
          const late = overdue.includes(task);
          const on = task.id === placingId;
          return (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onPick(task)}
              style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : late ? c.danger : c.border, backgroundColor: c.bg }}
            >
              <Text style={{ color: late ? c.danger : c.text, fontSize: font.size.xs, fontWeight: late ? "500" : "400" }}>{late ? `${task.title} · overdue` : task.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
