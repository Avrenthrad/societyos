import { createEntity, type ID, type Message, type Note, type Person, type Task } from "@societyos/core";
import { link, type Store } from "@societyos/sync";
import { baseSubject, displayName } from "./address.js";
import { detectedStart, type Detected } from "./detect.js";
import type { Address, MailMessage, MailState } from "./types.js";

/**
 * Where Inbox meets the rest of SocietyOS: an email becomes a task in Today,
 * a note in Notes, or a person in People, and stays linked to them.
 */

export interface Base {
  ownerId: ID;
  sourceApp: string;
}

/** The person in People with this email, if there is one. */
export function findPerson(people: Person[], a: Address): Person | undefined {
  const e = a.email.toLowerCase();
  return people.find((p) => p.emails.some((x) => x.toLowerCase() === e));
}

/**
 * Add a sender to People, or return the person who already has that email.
 * Swap for people-logic's findOrCreatePerson once it lands, so every app
 * matches people the same way.
 */
export async function addToPeople(store: Store, a: Address, base: Base): Promise<Person> {
  const existing = findPerson(await store.list("person"), a);
  if (existing) return existing;
  const person = createEntity("person", { ...base, name: a.name?.trim() || displayName(a), emails: [a.email.toLowerCase()], phones: [] });
  await store.put(person);
  return person;
}

/**
 * The shared-store copy of an email (a core `Message`), made the first time
 * it is turned into something. `state.shared` remembers it so the same email
 * is never copied twice. Returns the message and the updated mail state.
 */
export async function shareMessage(store: Store, state: MailState, msg: MailMessage, base: Base): Promise<{ message: Message; state: MailState }> {
  const knownId = state.shared[msg.id];
  if (knownId) {
    const found = await store.get("message", knownId);
    if (found) return { message: found, state };
  }
  const people = await store.list("person");
  const idOf = (a: Address) => findPerson(people, a)?.id ?? `email:${a.email.toLowerCase()}`;
  const message = createEntity("message", {
    ...base,
    channel: "email",
    threadId: msg.threadId,
    fromId: idOf(msg.from),
    toIds: [...msg.to, ...msg.cc].map(idOf),
    subject: msg.subject,
    body: msg.body.slice(0, 4000),
    read: msg.read,
  });
  await store.put(message);
  // Link known people too, so the email shows on their timeline.
  for (const p of people.filter((p) => [msg.from, ...msg.to, ...msg.cc].some((a) => findPerson([p], a)))) {
    await link(store, message, p, "mentions", base);
  }
  return { message, state: { ...state, shared: { ...state.shared, [msg.id]: message.id } } };
}

/** Default task length when an email gives a time but no end. */
export const EMAIL_BLOCK_MIN = 30;

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** The task fields for an email, using a detected date if one was picked. */
export function taskFieldsFromEmail(msg: MailMessage, when?: Detected, title?: string) {
  const fields: Pick<Task, "title" | "status" | "priority"> & Partial<Pick<Task, "dueAt" | "dueAllDay" | "block" | "notes">> = {
    title: title?.trim() || baseSubject(msg.subject) || `Email from ${displayName(msg.from)}`,
    status: "open",
    priority: 0,
    notes: `From ${msg.from.name ? `${msg.from.name} <${msg.from.email}>` : msg.from.email}`,
  };
  if (when) {
    const start = detectedStart(when);
    if (when.time && !when.deadline) {
      const end = new Date(start.getTime() + (when.durationMin ?? EMAIL_BLOCK_MIN) * 60_000);
      fields.block = { startsAt: start.toISOString(), endsAt: end.toISOString(), tz: tz() };
    } else {
      fields.dueAt = start.toISOString();
      fields.dueAllDay = !when.time;
    }
  }
  return fields;
}

/** Turn an email into a task in Today, linked back to the email. */
export async function emailToTask(
  store: Store,
  state: MailState,
  msg: MailMessage,
  base: Base,
  opts: { when?: Detected; title?: string } = {},
): Promise<{ task: Task; state: MailState }> {
  const shared = await shareMessage(store, state, msg, base);
  const task = createEntity("task", { ...base, ...taskFieldsFromEmail(msg, opts.when, opts.title) });
  await store.put(task);
  await link(store, task, shared.message, "created-from", base);
  const sender = findPerson(await store.list("person"), msg.from);
  if (sender) await link(store, task, sender, "mentions", base);
  return { task, state: shared.state };
}

/** Save a whole thread as a note in Notes, linked back to the email. */
export async function threadToNote(
  store: Store,
  state: MailState,
  thread: MailMessage[],
  base: Base,
): Promise<{ note: Note; state: MailState }> {
  const latest = thread[thread.length - 1]!;
  const shared = await shareMessage(store, state, latest, base);
  const body = thread
    .map((m) => `**${m.from.name ?? m.from.email}** · ${new Date(m.date).toLocaleString()}\n\n${m.body.trim()}`)
    .join("\n\n---\n\n");
  const note = createEntity("note", {
    ...base,
    title: baseSubject(latest.subject) || "Email",
    body,
    tags: ["email"],
    pinned: false,
  });
  await store.put(note);
  await link(store, note, shared.message, "created-from", base);
  return { note, state: shared.state };
}

/** Everything in other apps made from this email: tasks, notes. */
export async function madeFrom(store: Store, state: MailState, mailIds: string[]): Promise<(Task | Note)[]> {
  const out: (Task | Note)[] = [];
  for (const id of mailIds) {
    const sharedId = state.shared[id];
    if (!sharedId) continue;
    const links = await store.list("link", (l) => l.toId === sharedId && l.relation === "created-from");
    for (const l of links) {
      const e = (await store.get("task", l.fromId)) ?? (await store.get("note", l.fromId));
      if (e) out.push(e);
    }
  }
  return out;
}
