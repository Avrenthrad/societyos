/**
 * Shared data model for every SocietyOS app.
 *
 * Rule: an app may add its own entity types, but anything another app could
 * use (people, tasks, events, notes, messages) lives here so every app reads
 * and writes the same shape.
 */

export type ID = string;
export type ISODate = string;

export interface BaseEntity {
  id: ID;
  type: EntityType;
  ownerId: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** Soft delete, so a delete syncs to every device. */
  deletedAt?: ISODate;
  /** Which app created it, e.g. "notes". */
  sourceApp: string;
}

export interface Person extends BaseEntity {
  type: "person";
  name: string;
  emails: string[];
  phones: string[];
  notes?: string;
  /** "YYYY-MM-DD", or "--MM-DD" when the year is unknown (vCard style). */
  birthday?: string;
  /** Remind me to reach out if we haven't been in touch for this many days. */
  keepInTouchDays?: number;
  /**
   * Last contact logged by hand ("caught up today"). Contact found in linked
   * events, messages, tasks and money counts too, so this is rarely needed.
   */
  lastContactAt?: ISODate;
  /** Groups such as "family", "friends", "work". */
  tags?: string[];
}

export interface Note extends BaseEntity {
  type: "note";
  title: string;
  /** Markdown body. */
  body: string;
  tags: string[];
  pinned: boolean;
}

/** IANA timezone name, e.g. "Australia/Sydney". */
export type TimeZone = string;

export type TaskStatus = "open" | "done" | "wont-do";

/**
 * When a task is planned to happen. A task IS its time block: the calendar
 * draws this field directly, so moving the block edits the task itself and
 * there is never a second copy to keep in step.
 */
export interface TimeBlock {
  startsAt: ISODate;
  endsAt: ISODate;
  tz: TimeZone;
}

/** Repeat rule. `rrule` is an RFC 5545 RRULE body, e.g. "FREQ=MONTHLY;BYMONTHDAY=1". */
export interface Recurrence {
  rrule: string;
  tz: TimeZone;
  /** Next one is counted from when the last was completed ("every! 3 days"). */
  afterCompletion?: boolean;
}

export interface Task extends BaseEntity {
  type: "task";
  title: string;
  status: TaskStatus;
  /** Set when status becomes done or wont-do. */
  closedAt?: ISODate;
  /** Deadline. Independent of the block: plan Monday, due Friday. */
  dueAt?: ISODate;
  /** True when the due date has no time ("tomorrow" rather than "tomorrow 3pm"). */
  dueAllDay?: boolean;
  block?: TimeBlock;
  recurrence?: Recurrence;
  /** Last time a repeating task was ticked off (it then moves to its next date). */
  lastDoneAt?: ISODate;
  priority: 0 | 1 | 2 | 3;
  projectId?: ID;
  notes?: string;
}

export interface CalendarEvent extends BaseEntity {
  type: "event";
  title: string;
  startsAt: ISODate;
  endsAt: ISODate;
  allDay?: boolean;
  tz?: TimeZone;
  location?: string;
  attendeeIds: ID[];
  /** Set when the event came from an outside calendar (Google, Outlook...). */
  external?: { provider: string; calendarId: string; eventId: string };
}

export interface Message extends BaseEntity {
  type: "message";
  /** "email", "sms", "chat", ... so one inbox can hold every channel. */
  channel: string;
  threadId: ID;
  fromId: ID;
  toIds: ID[];
  subject?: string;
  body: string;
  read: boolean;
}

export interface Place extends BaseEntity {
  type: "place";
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}

/** A money movement: spend, income or transfer. Amounts in minor units (cents). */
export interface Transaction extends BaseEntity {
  type: "transaction";
  amountMinor: number;
  currency: string;
  occurredAt: ISODate;
  description: string;
  category?: string;
  accountId?: ID;
}

export interface FileRef extends BaseEntity {
  type: "file";
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Storage path (Supabase Storage); the bytes are not in the synced row. */
  storageKey: string;
}

/**
 * A link joins any two entities across apps: a note about a person, a task
 * made from a message, an event with its meeting notes.
 */
export interface Link extends BaseEntity {
  type: "link";
  fromId: ID;
  toId: ID;
  relation: LinkRelation;
}

export type LinkRelation =
  | "mentions"
  | "created-from"
  | "related"
  | "attendee"
  | "assigned-to"
  | "located-at"
  | "attached";

export type Entity =
  | Person
  | Note
  | Task
  | CalendarEvent
  | Message
  | Place
  | Transaction
  | FileRef
  | Link;
export type EntityType = Entity["type"];
export type EntityOf<T extends EntityType> = Extract<Entity, { type: T }>;
