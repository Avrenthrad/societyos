import type { CalendarEvent, Task } from "@societyos/core";
import type { Store } from "@societyos/sync";
import { addDays, daysBetween, sameDay, startOfDay } from "./dates.js";

/** One thing on the day's timeline: a task's block or a calendar event. */
export type TimelineItem =
  | { kind: "task"; id: string; title: string; start: Date; end: Date; task: Task; lane: number; lanes: number }
  | { kind: "event"; id: string; title: string; start: Date; end: Date; event: CalendarEvent; lane: number; lanes: number };

export interface DayAgenda {
  day: Date;
  allDay: CalendarEvent[];
  timeline: TimelineItem[];
  /** Open tasks with no time yet. */
  toSchedule: {
    /** Past their due date; rolled forward onto today so nothing is lost. */
    overdue: Task[];
    /** Due this day but not given a time. */
    due: Task[];
  };
  done: Task[];
}

const overlaps = (s: Date, e: Date, day: Date) => s < addDays(day, 1) && e > day;

/** Is this task "overdue" as of `now`: open, due before today, not planned for later. */
export function isOverdue(t: Task, now: Date): boolean {
  if (t.status !== "open" || !t.dueAt) return false;
  const today = startOfDay(now);
  if (new Date(t.dueAt) >= today) return false;
  return !t.block || new Date(t.block.endsAt) < today;
}

/** Side-by-side columns for items that overlap in time. */
export function layoutLanes<T extends { start: Date; end: Date; lane: number; lanes: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => +a.start - +b.start || +b.end - +a.end);
  let cluster: T[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= +it.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = +it.end;
      it.lane = lane;
    }
    for (const it of cluster) it.lanes = laneEnds.length;
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && +it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, +it.end);
  }
  flush();
  return sorted;
}

/** Everything for one day, from tasks and events alike. */
export async function dayAgenda(store: Store, day: Date, now: Date = new Date()): Promise<DayAgenda> {
  const d = startOfDay(day);
  const isToday = sameDay(d, now);
  const [tasks, events] = await Promise.all([store.list("task"), store.list("event")]);

  const timeline: TimelineItem[] = [];
  const allDay: CalendarEvent[] = [];
  for (const e of events) {
    const s = new Date(e.startsAt);
    const en = new Date(e.endsAt);
    if (!overlaps(s, en, d)) continue;
    if (e.allDay) allDay.push(e);
    else timeline.push({ kind: "event", id: e.id, title: e.title, start: s, end: en, event: e, lane: 0, lanes: 1 });
  }
  for (const t of tasks) {
    if (!t.block || t.status === "wont-do") continue;
    const s = new Date(t.block.startsAt);
    const en = new Date(t.block.endsAt);
    if (overlaps(s, en, d)) timeline.push({ kind: "task", id: t.id, title: t.title, start: s, end: en, task: t, lane: 0, lanes: 1 });
  }

  const unplanned = tasks.filter((t) => t.status === "open" && !t.block);
  const overdue = isToday ? tasks.filter((t) => isOverdue(t, now)) : [];
  const due = unplanned.filter((t) => t.dueAt && sameDay(new Date(t.dueAt), d));
  const done = tasks.filter(
    (t) =>
      (t.status === "done" && t.closedAt && sameDay(new Date(t.closedAt), d)) ||
      (t.lastDoneAt && sameDay(new Date(t.lastDoneAt), d)),
  );

  const byPriority = (a: Task, b: Task) => b.priority - a.priority || a.title.localeCompare(b.title);
  return {
    day: d,
    allDay,
    timeline: layoutLanes(timeline),
    toSchedule: { overdue: overdue.sort(byPriority), due: due.sort(byPriority) },
    done,
  };
}

/** Counts for the side menu. */
export async function viewCounts(store: Store, now: Date = new Date()) {
  const tasks = (await store.list("task")).filter((t) => t.status === "open");
  const when = (t: Task) => (t.block ? new Date(t.block.startsAt) : t.dueAt ? new Date(t.dueAt) : undefined);
  let today = 0;
  let upcoming = 0;
  let inbox = 0;
  for (const t of tasks) {
    const w = when(t);
    if (!w) inbox++;
    else if (daysBetween(now, w) <= 0) today++;
    else upcoming++;
  }
  return { today, upcoming, inbox };
}
