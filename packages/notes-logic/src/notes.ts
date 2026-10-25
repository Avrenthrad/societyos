import { createEntity, type CalendarEvent, type ID, type Link, type Note, type Person, type Task } from "@societyos/core";
import { link, linksFor, type Store } from "@societyos/sync";
import { checklist, extractMentions, extractNoteLinks, extractTags, toggleChecklist, type ChecklistItem } from "./parse.js";

export interface Ctx {
  ownerId: ID;
  sourceApp: string;
}

export function newNote(ctx: Ctx, fields: Partial<Pick<Note, "title" | "body" | "tags" | "pinned">> = {}): Note {
  const body = fields.body ?? "";
  return createEntity("note", {
    ...ctx,
    title: fields.title ?? "",
    body,
    tags: fields.tags ?? extractTags(`${fields.title ?? ""} ${body}`),
    pinned: fields.pinned ?? false,
  });
}

/**
 * Save an edit. Tags are read from the text, and links to the people
 * (@Sam) and notes ([[Plan]]) it mentions are kept in step, so People and
 * other apps see the note without anyone filing it by hand.
 */
export async function saveNote(store: Store, note: Note, edit: Partial<Pick<Note, "title" | "body" | "pinned">>, ctx: Ctx): Promise<Note> {
  const next: Note = { ...note, ...edit };
  next.tags = extractTags(`${next.title} ${next.body}`);
  await store.put(next);
  await syncNoteLinks(store, next, ctx);
  return (await store.get("note", next.id)) ?? next;
}

/** Make the note's "mentions" links match the people and notes named in it. */
export async function syncNoteLinks(store: Store, note: Note, ctx: Ctx) {
  const [people, notes, existing] = await Promise.all([
    store.list("person"),
    store.list("note", (n) => n.id !== note.id),
    store.list("link", (l) => l.fromId === note.id && l.relation === "mentions"),
  ]);
  const text = `${note.title}\n${note.body}`;
  const want = new Set<ID>(extractMentions(text, people).map((p) => p.id));
  for (const title of extractNoteLinks(text)) {
    const target = findByTitle(notes, title);
    if (target) want.add(target.id);
  }
  const have = new Set(existing.map((l) => l.toId));
  for (const l of existing) if (!want.has(l.toId)) await store.remove("link", l.id);
  for (const id of want) {
    if (have.has(id)) continue;
    const to = people.find((p) => p.id === id) ?? notes.find((n) => n.id === id);
    if (to) await link(store, note, to, "mentions", ctx);
  }
}

export function findByTitle(notes: Note[], title: string): Note | undefined {
  const t = title.trim().toLowerCase();
  return notes.find((n) => n.title.trim().toLowerCase() === t);
}

export interface Connections {
  people: Person[];
  /** Notes this one links to with [[...]]. */
  notes: Note[];
  /** Notes that link to this one. */
  backlinks: Note[];
  /** Tasks made from this note's checklist. */
  tasks: Task[];
  /** The calendar event a meeting note belongs to. */
  event?: CalendarEvent;
}

/** Everything a note is joined to, across every app. */
export async function connections(store: Store, noteId: ID): Promise<Connections> {
  const out: Connections = { people: [], notes: [], backlinks: [], tasks: [] };
  for (const l of await linksFor(store, noteId)) {
    const outgoing = l.fromId === noteId;
    const other = outgoing ? l.toId : l.fromId;
    if (outgoing && l.relation === "created-from") {
      out.event ??= await store.get("event", other);
      continue;
    }
    const person = await store.get("person", other);
    if (person) {
      if (!out.people.some((p) => p.id === person.id)) out.people.push(person);
      continue;
    }
    const note = await store.get("note", other);
    if (note) {
      const list = outgoing ? out.notes : out.backlinks;
      if (!list.some((n) => n.id === note.id)) list.push(note);
      continue;
    }
    const task = await store.get("task", other);
    if (task && !out.tasks.some((t) => t.id === task.id)) out.tasks.push(task);
  }
  return out;
}

// ---- Checklists and Today ----

/** A checklist item as a task title: "Send mockups to @Sam Lee" becomes "Send mockups to Sam Lee". */
export function taskTitle(itemText: string): string {
  return itemText.replace(/(^|\s)@(?=[\p{L}\p{N}])/gu, "$1").replace(/\s+/g, " ").trim();
}

const sameText = (a: string, b: string) => taskTitle(a).toLowerCase() === taskTitle(b).toLowerCase();

/** The Today task made from a checklist item, if there is one. */
export function taskForItem(item: ChecklistItem, tasks: Task[]): Task | undefined {
  return tasks.find((t) => sameText(t.title, item.text));
}

/**
 * Turn a checklist item into a task in Today (due today, waiting for a
 * time), linked back to the note and to anyone @mentioned in the item.
 * Does nothing if it already is one.
 */
export async function sendToToday(store: Store, note: Note, item: ChecklistItem, ctx: Ctx, now = new Date()): Promise<Task> {
  const { tasks } = await connections(store, note.id);
  const existing = taskForItem(item, tasks);
  if (existing) return existing;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const task = createEntity("task", {
    ...ctx,
    title: taskTitle(item.text),
    status: item.done ? "done" : "open",
    ...(item.done ? { closedAt: now.toISOString() } : {}),
    priority: 0,
    dueAt: today.toISOString(),
    dueAllDay: true,
  });
  await store.put(task);
  await link(store, task, note, "created-from", ctx);
  for (const p of extractMentions(item.text, await store.list("person"))) await link(store, task, p, "mentions", ctx);
  return task;
}

/** Tick an item in the note; its Today task (if any) is closed or reopened to match. */
export async function toggleItem(store: Store, note: Note, item: ChecklistItem, ctx: Ctx, now = new Date()): Promise<Note> {
  const saved = await saveNote(store, note, { body: toggleChecklist(note.body, item.line) }, ctx);
  const task = taskForItem(item, (await connections(store, note.id)).tasks);
  if (task && task.status !== "wont-do" && !task.recurrence) {
    const done = !item.done;
    await store.put({ ...task, status: done ? "done" : "open", closedAt: done ? now.toISOString() : undefined });
  }
  return saved;
}

/**
 * Tasks finished in Today tick their item in the note, so the two never
 * disagree. Returns the note unchanged when there is nothing to tick.
 */
export async function pullTaskStatus(store: Store, note: Note, ctx: Ctx): Promise<Note> {
  const { tasks } = await connections(store, note.id);
  let body = note.body;
  for (const item of checklist(note.body)) {
    const t = taskForItem(item, tasks);
    if (t && !item.done && t.status !== "open") body = toggleChecklist(body, item.line);
  }
  return body === note.body ? note : saveNote(store, note, { body }, ctx);
}

// ---- Organising ----

export interface TagNode {
  /** Full path, e.g. "work/meetings". */
  path: string;
  /** Last part, e.g. "meetings". */
  name: string;
  /** Notes with this tag or any tag inside it. */
  count: number;
  children: TagNode[];
}

/** Nested tags as a tree: "#work/meetings" sits inside "#work". */
export function tagTree(notes: Note[]): TagNode[] {
  const root: TagNode = { path: "", name: "", count: 0, children: [] };
  for (const n of notes) {
    const counted = new Set<TagNode>();
    for (const tag of n.tags) {
      let node = root;
      const parts = tag.split("/");
      parts.forEach((name, i) => {
        const path = parts.slice(0, i + 1).join("/");
        let child = node.children.find((c) => c.path === path);
        if (!child) node.children.push((child = { path, name, count: 0, children: [] }));
        if (!counted.has(child)) {
          child.count++;
          counted.add(child);
        }
        node = child;
      });
    }
  }
  const sort = (nodes: TagNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((c) => sort(c.children));
    return nodes;
  };
  return sort(root.children);
}

/** Does the note carry this tag, or one nested inside it? */
export function hasTag(note: Note, tag: string): boolean {
  return note.tags.some((t) => t === tag || t.startsWith(`${tag}/`));
}

/** Pinned first, then most recently edited. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}

export type { Link };
