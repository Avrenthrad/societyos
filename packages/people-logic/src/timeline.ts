import type { Entity, ID, Person } from "@societyos/core";
import type { Store } from "@societyos/sync";

/**
 * A person's timeline fills itself: nothing here is typed into People.
 * Anything from any app shows up when it is
 * - linked to the person (any link relation, either direction),
 * - an event they attend (`attendeeIds`),
 * - a message from or to them (`fromId` / `toIds`),
 * - text that names them in full ("Dinner with Sam Lee").
 */

export type TimelineKind = "event" | "task" | "note" | "message" | "transaction" | "file";

export interface TimelineEntry {
  id: ID;
  kind: TimelineKind;
  title: string;
  /** When it happened, or will happen. */
  at: Date;
  /** Short extra line: "Done", "$42.50", "Email", an event's place. */
  detail?: string;
  /** Counts as being in touch (a past meeting, a message, a finished task with them). */
  contact: boolean;
  via: "link" | "attendee" | "message" | "mention";
}

export interface PersonActivity {
  /** Newest first. */
  past: TimelineEntry[];
  /** Soonest first. */
  upcoming: TimelineEntry[];
  /** Latest contact found in the timeline or logged by hand. */
  lastContact?: Date;
}

const KINDS: TimelineKind[] = ["event", "task", "note", "message", "transaction", "file"];

function money(minor: number, currency: string) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor) / 100;
  try {
    return sign + new Intl.NumberFormat(undefined, { style: "currency", currency }).format(abs);
  } catch {
    return `${sign}${abs.toFixed(2)} ${currency}`;
  }
}

/** How an entity shows on a timeline, or undefined if it never does. */
export function toEntry(e: Entity, via: TimelineEntry["via"], now: Date): TimelineEntry | undefined {
  switch (e.type) {
    case "event": {
      const at = new Date(e.startsAt);
      return { id: e.id, kind: "event", title: e.title, at, detail: e.location, contact: new Date(e.endsAt) <= now, via };
    }
    case "task": {
      const when = e.status === "done" ? e.closedAt : e.block?.startsAt ?? e.dueAt;
      const at = new Date(when ?? e.createdAt);
      const detail = e.status === "done" ? "Done" : e.status === "wont-do" ? "Won't do" : e.block || e.dueAt ? "Planned" : "To do";
      return { id: e.id, kind: "task", title: e.title, at, detail, contact: e.status === "done", via };
    }
    case "note":
      return { id: e.id, kind: "note", title: e.title || "Untitled note", at: new Date(e.createdAt), contact: false, via };
    case "message":
      return {
        id: e.id, kind: "message", title: e.subject || e.body.slice(0, 80) || "Message", at: new Date(e.createdAt),
        detail: e.channel === "email" ? "Email" : e.channel, contact: true, via,
      };
    case "transaction":
      return {
        id: e.id, kind: "transaction", title: e.description, at: new Date(e.occurredAt),
        detail: money(e.amountMinor, e.currency), contact: new Date(e.occurredAt) <= now, via,
      };
    case "file":
      return { id: e.id, kind: "file", title: e.name, at: new Date(e.createdAt), contact: false, via };
    default:
      return undefined;
  }
}

/** Text of an entity that may name a person. */
function textOf(e: Entity): string {
  switch (e.type) {
    case "event": return e.title;
    case "task": return e.title;
    case "note": return `${e.title}\n${e.body}`;
    case "message": return `${e.subject ?? ""}\n${e.body}`;
    case "transaction": return e.description;
    default: return "";
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a full name (two words or more) as whole words, any case. */
export function namePattern(name: string): RegExp | undefined {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return undefined; // a lone first name is too easy to match by accident
  return new RegExp(`(^|[^\\p{L}\\p{N}])${words.map(escape).join("\\s+")}(?=$|[^\\p{L}\\p{N}])`, "iu");
}

/**
 * Build every person's timeline in one pass over the store. Cheap enough to
 * re-run on each change for one person's data.
 */
export async function peopleActivity(store: Store, now: Date = new Date()): Promise<Map<ID, PersonActivity>> {
  const people = await store.list("person");
  const byId = new Map(people.map((p) => [p.id, p]));
  const entities = new Map<ID, Entity>();
  for (const k of KINDS) for (const e of await store.list(k)) entities.set(e.id, e);

  const found = new Map<ID, Map<ID, TimelineEntry>>();
  const add = (personId: ID, e: Entity | undefined, via: TimelineEntry["via"]) => {
    if (!e || !byId.has(personId)) return;
    const entry = toEntry(e, via, now);
    if (!entry) return;
    let m = found.get(personId);
    if (!m) found.set(personId, (m = new Map()));
    if (!m.has(e.id) || via !== "mention") m.set(e.id, entry); // an explicit tie beats a mention
  };

  for (const l of await store.list("link")) {
    if (byId.has(l.fromId)) add(l.fromId, entities.get(l.toId), "link");
    if (byId.has(l.toId)) add(l.toId, entities.get(l.fromId), "link");
  }

  const patterns = people.flatMap((p) => {
    const re = namePattern(p.name);
    return re ? [{ id: p.id, re }] : [];
  });
  for (const e of entities.values()) {
    if (e.type === "event") for (const id of e.attendeeIds) add(id, e, "attendee");
    if (e.type === "message") for (const id of [e.fromId, ...e.toIds]) add(id, e, "message");
    const text = textOf(e);
    if (text) for (const { id, re } of patterns) if (!found.get(id)?.has(e.id) && re.test(text)) add(id, e, "mention");
  }

  const out = new Map<ID, PersonActivity>();
  for (const p of people) {
    const entries = [...(found.get(p.id)?.values() ?? [])];
    const past = entries.filter((x) => x.at <= now || x.contact).sort((a, b) => +b.at - +a.at);
    const upcoming = entries.filter((x) => x.at > now && !x.contact).sort((a, b) => +a.at - +b.at);
    let last = p.lastContactAt ? new Date(p.lastContactAt) : undefined;
    for (const x of past) if (x.contact && x.at <= now && (!last || x.at > last)) last = x.at;
    out.set(p.id, { past, upcoming, lastContact: last });
  }
  return out;
}

/** One person's timeline. */
export async function personTimeline(store: Store, person: Person, now: Date = new Date()): Promise<PersonActivity> {
  return (await peopleActivity(store, now)).get(person.id) ?? { past: [], upcoming: [] };
}
