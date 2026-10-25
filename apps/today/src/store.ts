import { createEntity, type Entity } from "@societyos/core";
import { MemoryStore, link } from "@societyos/sync";
import { addDays, addMinutes, localTz, startOfDay } from "@societyos/today-logic";

// One store per app session. Swap for the SQLite + sync store once the
// backend is set up (see docs/architecture.md).
export const store = new MemoryStore();
export const ME = "local-user";
export const APP = "today";

const base = { ownerId: ME, sourceApp: APP };

/**
 * Demo data so the app opens looking like the agreed layout. Remove once
 * real data syncs in from the other apps and devices.
 */
export async function seedDemo(now = new Date()) {
  const tz = localTz();
  const today = startOfDay(now);
  const at = (h: number, m = 0, day = today) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
  const block = (h: number, m: number, min: number) => {
    const s = at(h, m);
    return { startsAt: s.toISOString(), endsAt: addMinutes(s, min).toISOString(), tz };
  };

  const sam = createEntity("person", { ...base, sourceApp: "people", name: "Sam", emails: [], phones: [] });
  const roadmap = createEntity("note", { ...base, sourceApp: "notes", title: "SocietyOS roadmap", body: "", tags: [], pinned: true });
  const spec = createEntity("file", { ...base, sourceApp: "files", name: "spec-draft.md", mimeType: "text/markdown", sizeBytes: 0, storageKey: "" });
  const email = createEntity("message", {
    ...base, sourceApp: "inbox", channel: "email", threadId: "demo", fromId: "landlord", toIds: [ME],
    subject: "Lease renewal", body: "", read: true,
  });

  const event = (title: string, h: number, m: number, min: number, extra: object = {}) =>
    createEntity("event", { ...base, title, startsAt: at(h, m).toISOString(), endsAt: addMinutes(at(h, m), min).toISOString(), tz, attendeeIds: [], ...extra });
  const task = (title: string, extra: object = {}) =>
    createEntity("task", { ...base, title, status: "open" as const, priority: 0 as const, ...extra });

  const writeSpec = task("Write Tasks app spec", { block: block(9, 0, 90), dueAt: addDays(today, 1).toISOString(), dueAllDay: true, projectId: "SocietyOS" });
  const callSam = task("Call Sam", { block: block(15, 0, 30) });
  const reply = task("Reply to landlord", { dueAt: today.toISOString(), dueAllDay: true });

  const rows: Entity[] = [
    sam, roadmap, spec, email,
    event("Gym", 7, 0, 60),
    event("Dentist", 11, 0, 45),
    event("Lunch with Sam", 12, 30, 60, { attendeeIds: [sam.id] }),
    createEntity("event", { ...base, title: "Sam's birthday", startsAt: today.toISOString(), endsAt: addDays(today, 1).toISOString(), allDay: true, attendeeIds: [sam.id] }),
    writeSpec, callSam, reply,
    task("Groceries", { block: block(17, 30, 45), projectId: "Errands" }),
    task("Renew car rego", { dueAt: addDays(today, -2).toISOString(), dueAllDay: true, priority: 2 }),
    task("Book flights to Darwin", { dueAt: today.toISOString(), dueAllDay: true }),
    task("Morning walk", { status: "done", closedAt: at(7, 45).toISOString() }),
    task("Pay rent", { dueAt: addDays(today, 7).toISOString(), dueAllDay: true, recurrence: { rrule: "FREQ=MONTHLY;BYMONTHDAY=1", tz } }),
  ];
  for (const r of rows) await store.put(r);
  await link(store, writeSpec, sam, "mentions", base);
  await link(store, writeSpec, roadmap, "related", base);
  await link(store, writeSpec, spec, "attached", base);
  await link(store, callSam, sam, "mentions", base);
  await link(store, reply, email, "created-from", base);
}
