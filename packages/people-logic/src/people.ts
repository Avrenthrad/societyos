import { createEntity, type ID, type Person, type Task } from "@societyos/core";
import { link, linksFor, type Store } from "@societyos/sync";
import { nextBirthday } from "./birthdays.js";

export interface Base {
  ownerId: ID;
  sourceApp: string;
}

const norm = (s: string) => s.trim().toLowerCase();
const digits = (s: string) => s.replace(/[^\d+]/g, "");

/** Find someone by email, then phone, then exact name. */
export function findPerson(people: Person[], q: { name?: string; email?: string; phone?: string }): Person | undefined {
  if (q.email) {
    const e = norm(q.email);
    const hit = people.find((p) => p.emails.some((x) => norm(x) === e));
    if (hit) return hit;
  }
  if (q.phone && digits(q.phone).length >= 6) {
    const ph = digits(q.phone);
    const hit = people.find((p) => p.phones.some((x) => digits(x) === ph));
    if (hit) return hit;
  }
  if (q.name?.trim()) {
    const n = norm(q.name);
    return people.find((p) => norm(p.name) === n);
  }
  return undefined;
}

/**
 * The one way any app should get a Person for a name or email (an email
 * sender, a payee): reuses the existing person, filling in a missing email,
 * so People never ends up with duplicates.
 */
export async function findOrCreatePerson(store: Store, q: { name?: string; email?: string; phone?: string }, base: Base): Promise<Person> {
  const people = await store.list("person");
  const hit = findPerson(people, q);
  if (hit) {
    const emails = q.email && !hit.emails.some((x) => norm(x) === norm(q.email!)) ? [...hit.emails, q.email.trim()] : hit.emails;
    const phones = q.phone && !hit.phones.some((x) => digits(x) === digits(q.phone!)) ? [...hit.phones, q.phone.trim()] : hit.phones;
    if (emails !== hit.emails || phones !== hit.phones) {
      const updated = { ...hit, emails, phones };
      await store.put(updated);
      return updated;
    }
    return hit;
  }
  const name = q.name?.trim() || q.email?.split("@")[0] || q.phone || "New person";
  const p = createEntity("person", { ...base, name, emails: q.email ? [q.email.trim()] : [], phones: q.phone ? [q.phone.trim()] : [] });
  await store.put(p);
  return p;
}

/** "Sam Lee" to "SL", "Prince" to "P". */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return ((w[0]![0] ?? "") + (w.length > 1 ? w[w.length - 1]![0] ?? "" : "")).toUpperCase();
}

/** Log "we caught up" for today. */
export async function markCaughtUp(store: Store, person: Person, now: Date = new Date()) {
  await store.put({ ...person, lastContactAt: now.toISOString() });
}

async function openLinkedTask(store: Store, person: Person, title: string): Promise<Task | undefined> {
  for (const l of await linksFor(store, person.id)) {
    const t = await store.get("task", l.fromId === person.id ? l.toId : l.fromId);
    if (t && t.status === "open" && t.title === title) return t;
  }
  return undefined;
}

/** Put "Catch up with Sam" on Today, linked to Sam. Reuses an open one. */
export async function planCatchUp(store: Store, person: Person, base: Base, now: Date = new Date()): Promise<Task> {
  const title = `Catch up with ${person.name}`;
  const existing = await openLinkedTask(store, person, title);
  if (existing) return existing;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const task = createEntity("task", { ...base, title, status: "open", priority: 0, dueAt: today.toISOString(), dueAllDay: true });
  await store.put(task);
  await link(store, task, person, "mentions", base);
  return task;
}

/**
 * A yearly "Wish Sam a happy birthday" task on Today, due on the day.
 * Reuses an open one, so tapping twice doesn't make two.
 */
export async function addBirthdayReminder(store: Store, person: Person, base: Base, tz: string, now: Date = new Date()): Promise<Task | undefined> {
  const next = person.birthday ? nextBirthday(person.birthday, now) : undefined;
  if (!next) return undefined;
  const title = `Wish ${person.name} a happy birthday`;
  const existing = await openLinkedTask(store, person, title);
  if (existing) return existing;
  const task = createEntity("task", {
    ...base, title, status: "open", priority: 1, dueAt: next.date.toISOString(), dueAllDay: true,
    recurrence: { rrule: "FREQ=YEARLY", tz },
  });
  await store.put(task);
  await link(store, task, person, "mentions", base);
  return task;
}

/** A–Z by name, ignoring case and accents. */
export function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Filter by name, email, phone, tag or notes. */
export function filterPeople(people: Person[], query: string): Person[] {
  const q = norm(query);
  if (!q) return people;
  return people.filter((p) =>
    [p.name, ...p.emails, ...p.phones, ...(p.tags ?? []), p.notes ?? ""].some((v) => v.toLowerCase().includes(q)),
  );
}
