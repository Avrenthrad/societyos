import { createEntity, type Task } from "@societyos/core";
import { MemoryStore } from "@societyos/sync";
import { describe, expect, it } from "vitest";
import { dayAgenda } from "./agenda.js";
import { nextOccurrence } from "./recurrence.js";
import { completeTask, moveBlock, scheduleTask, setStatus, skipOccurrence, unscheduleTask } from "./schedule.js";

const base = { ownerId: "u1", sourceApp: "today" };
const now = new Date(2026, 9, 25, 10, 40); // Sun 25 Oct 2026
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const iso = (d: Date) => d.toISOString();

function task(fields: Partial<Task> = {}) {
  return createEntity("task", { ...base, title: "Write spec", status: "open", priority: 0, ...fields });
}

describe("a task is its own time block", () => {
  it("dragging to 10:00–11:30 changes one row, and list + calendar both show it", async () => {
    const s = new MemoryStore();
    const t = task({ dueAt: iso(at(25, 0)), dueAllDay: true });
    await s.put(t);

    const changes: string[] = [];
    s.subscribe((c) => changes.push(c.entity.id));
    await scheduleTask(s, t, at(25, 10), at(25, 11, 30), "Australia/Sydney");

    expect(changes).toEqual([t.id]); // exactly one row written
    expect(await s.list("task")).toHaveLength(1); // no copy made
    expect(await s.list("event")).toHaveLength(0);

    const day = await dayAgenda(s, now, now);
    expect(day.toSchedule.due).toHaveLength(0); // left the "to schedule" list
    expect(day.timeline).toHaveLength(1);
    expect(day.timeline[0]).toMatchObject({ kind: "task", id: t.id, start: at(25, 10), end: at(25, 11, 30) });
  });

  it("moving keeps the length; unscheduling puts it back to To schedule", async () => {
    const s = new MemoryStore();
    let t = task({ dueAt: iso(at(25, 0)) });
    await s.put(t);
    t = await scheduleTask(s, t, at(25, 9), at(25, 10, 30));
    t = await moveBlock(s, t, at(25, 14));
    expect(t.block).toMatchObject({ startsAt: iso(at(25, 14)), endsAt: iso(at(25, 15, 30)) });
    await unscheduleTask(s, t);
    expect((await dayAgenda(s, now, now)).toSchedule.due.map((x) => x.id)).toEqual([t.id]);
  });

  it("shows events and task blocks together, side by side when they overlap", async () => {
    const s = new MemoryStore();
    await s.put(createEntity("event", { ...base, title: "Dentist", startsAt: iso(at(25, 11)), endsAt: iso(at(25, 11, 45)), attendeeIds: [] }));
    await s.put(createEntity("event", { ...base, title: "Birthday", startsAt: iso(at(25, 0)), endsAt: iso(at(26, 0)), allDay: true, attendeeIds: [] }));
    const t = task();
    await s.put(t);
    await scheduleTask(s, t, at(25, 11, 30), at(25, 12));
    const day = await dayAgenda(s, now, now);
    expect(day.allDay.map((e) => e.title)).toEqual(["Birthday"]);
    expect(day.timeline.map((i) => [i.title, i.lane, i.lanes])).toEqual([
      ["Dentist", 0, 2],
      ["Write spec", 1, 2],
    ]);
  });
});

describe("task states", () => {
  it("open / done / won't do", async () => {
    const s = new MemoryStore();
    let t = task();
    await s.put(t);
    t = await setStatus(s, t, "wont-do", now);
    expect(t).toMatchObject({ status: "wont-do", closedAt: iso(now) });
    t = await setStatus(s, t, "open", now);
    expect(t.closedAt).toBeUndefined();
    t = await setStatus(s, t, "done", now);
    expect(t.status).toBe("done");
    expect((await dayAgenda(s, now, now)).done).toHaveLength(1);
  });

  it("overdue tasks roll forward onto today", async () => {
    const s = new MemoryStore();
    await s.put(task({ title: "Renew rego", dueAt: iso(at(23, 0)), dueAllDay: true }));
    await s.put(task({ title: "Later", dueAt: iso(at(28, 0)) }));
    const day = await dayAgenda(s, now, now);
    expect(day.toSchedule.overdue.map((t) => t.title)).toEqual(["Renew rego"]);
  });
});

describe("repeating tasks", () => {
  it("completing moves the same task to its next date (no new rows)", async () => {
    const s = new MemoryStore();
    let t = task({
      title: "Pay rent",
      dueAt: iso(new Date(2026, 9, 1)),
      recurrence: { rrule: "FREQ=MONTHLY;BYMONTHDAY=1", tz: "Australia/Sydney" },
    });
    await s.put(t);
    t = await completeTask(s, t, new Date(2026, 9, 1, 9));
    expect(t.status).toBe("open");
    expect(t.dueAt).toBe(iso(new Date(2026, 10, 1)));
    expect(await s.list("task")).toHaveLength(1);
  });

  it("can be marked done on a past date", async () => {
    const s = new MemoryStore();
    let t = task({
      dueAt: iso(at(22, 0)),
      recurrence: { rrule: "FREQ=DAILY", tz: "Australia/Sydney" },
    });
    await s.put(t);
    // "I did Thursday's one" (done on Thu 22) -> next is Fri 23, still overdue.
    t = await completeTask(s, t, at(22, 20));
    expect(t.dueAt).toBe(iso(at(23, 0)));
    expect(t.lastDoneAt).toBe(iso(at(22, 20)));
  });

  it("every! 3 days counts from when it was done, keeping the block length", async () => {
    const s = new MemoryStore();
    let t = task({
      block: { startsAt: iso(at(20, 18)), endsAt: iso(at(20, 18, 15)), tz: "Australia/Sydney" },
      recurrence: { rrule: "FREQ=DAILY;INTERVAL=3", tz: "Australia/Sydney", afterCompletion: true },
    });
    await s.put(t);
    t = await completeTask(s, t, at(25, 9));
    expect(t.block).toMatchObject({ startsAt: iso(at(28, 18)), endsAt: iso(at(28, 18, 15)) });
  });

  it("skip one occurrence", async () => {
    const s = new MemoryStore();
    let t = task({ dueAt: iso(at(28, 0)), recurrence: { rrule: "FREQ=WEEKLY", tz: "Australia/Sydney" } });
    await s.put(t);
    t = await skipOccurrence(s, t);
    expect(t.dueAt).toBe(iso(new Date(2026, 10, 4)));
    expect(t.lastDoneAt).toBeUndefined();
  });

  it("keeps wall-clock time across daylight saving (Sydney, 4 Oct 2026)", () => {
    const start = new Date(2026, 9, 3, 9); // Sat 3 Oct 09:00
    const next = nextOccurrence("FREQ=DAILY", start, start)!;
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([4, 9, 0]);
    const apr = new Date(2027, 3, 3, 9); // Sat 3 Apr 2027, DST ends next day
    const n2 = nextOccurrence("FREQ=DAILY", apr, apr)!;
    expect([n2.getDate(), n2.getHours()]).toEqual([4, 9]);
  });

  it("2nd and 4th Wednesday", () => {
    const start = new Date(2026, 9, 14, 8); // 2nd Wed of Oct
    const n = nextOccurrence("FREQ=MONTHLY;BYDAY=2WE,4WE", start, start)!;
    expect(n).toEqual(new Date(2026, 9, 28, 8));
    expect(nextOccurrence("FREQ=MONTHLY;BYDAY=2WE,4WE", start, n)).toEqual(new Date(2026, 10, 11, 8));
  });
});
