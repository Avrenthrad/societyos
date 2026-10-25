import type { Task, TaskStatus } from "@societyos/core";
import type { Store } from "@societyos/sync";
import { addMinutes, localTz } from "./dates.js";
import { addInterval, nextOccurrence } from "./recurrence.js";

/**
 * Every change here rewrites the one task row. The calendar draws
 * `task.block` directly, so the list and the calendar can never disagree.
 */

/** Give a task a time on the calendar (or move it there). */
export async function scheduleTask(store: Store, task: Task, start: Date, end: Date, tz: string = task.block?.tz ?? localTz()) {
  const next: Task = { ...task, block: { startsAt: start.toISOString(), endsAt: end.toISOString(), tz } };
  await store.put(next);
  return next;
}

/** Drag a block: same length, new start. */
export function moveBlock(store: Store, task: Task, start: Date) {
  if (!task.block) throw new Error("Task has no time block");
  const len = Date.parse(task.block.endsAt) - Date.parse(task.block.startsAt);
  return scheduleTask(store, task, start, new Date(start.getTime() + len));
}

/** Drag a block's bottom edge. Never shorter than 5 minutes. */
export function resizeBlock(store: Store, task: Task, end: Date) {
  if (!task.block) throw new Error("Task has no time block");
  const start = new Date(task.block.startsAt);
  return scheduleTask(store, task, start, end > addMinutes(start, 5) ? end : addMinutes(start, 5));
}

/** Take a task off the calendar; it goes back to "To schedule". */
export async function unscheduleTask(store: Store, task: Task) {
  const { block: _drop, ...rest } = task;
  await store.put(rest as Task);
  return rest as Task;
}

/** The moment a task's current occurrence is anchored to. */
function anchorOf(task: Task, fallback: Date): Date {
  return new Date(task.block?.startsAt ?? task.dueAt ?? fallback.toISOString());
}

/** Move a repeating task to its next date, keeping block length. */
function advance(task: Task, after: Date, doneOn: Date): Task {
  const rec = task.recurrence!;
  const anchor = anchorOf(task, doneOn);
  const next = rec.afterCompletion
    ? addInterval(rec.rrule, anchor, doneOn)
    : nextOccurrence(rec.rrule, anchor, after > anchor ? after : anchor);
  if (!next) return { ...task, recurrence: undefined, status: "done", closedAt: doneOn.toISOString() };
  const delta = next.getTime() - anchor.getTime();
  const shift = (iso?: string) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : undefined);
  return {
    ...task,
    dueAt: shift(task.dueAt),
    block: task.block && { ...task.block, startsAt: shift(task.block.startsAt)!, endsAt: shift(task.block.endsAt)! },
  };
}

/**
 * Tick a task off. A repeating task stays open and moves to its next date.
 * `on` lets someone mark it done for an earlier day ("I did it Friday").
 */
export async function completeTask(store: Store, task: Task, on: Date = new Date()) {
  const next: Task = task.recurrence
    ? { ...advance(task, on, on), lastDoneAt: on.toISOString() }
    : { ...task, status: "done", closedAt: on.toISOString() };
  await store.put(next);
  return next;
}

/** Skip one occurrence of a repeating task without marking it done. */
export async function skipOccurrence(store: Store, task: Task) {
  if (!task.recurrence) throw new Error("Task does not repeat");
  const anchor = anchorOf(task, new Date());
  const next = advance({ ...task, recurrence: { ...task.recurrence, afterCompletion: false } }, anchor, anchor);
  const kept: Task = { ...next, recurrence: task.recurrence };
  await store.put(kept);
  return kept;
}

/** Open / done / won't do. */
export async function setStatus(store: Store, task: Task, status: TaskStatus, on: Date = new Date()) {
  if (status === "done") return completeTask(store, task, on);
  const next: Task =
    status === "open"
      ? { ...task, status, closedAt: undefined }
      : { ...task, status, closedAt: on.toISOString() };
  await store.put(next);
  return next;
}
