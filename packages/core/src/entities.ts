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
}

export interface Note extends BaseEntity {
  type: "note";
  title: string;
  /** Markdown body. */
  body: string;
  tags: string[];
  pinned: boolean;
}

export interface Task extends BaseEntity {
  type: "task";
  title: string;
  done: boolean;
  dueAt?: ISODate;
  priority: 0 | 1 | 2 | 3;
  projectId?: ID;
}

export interface CalendarEvent extends BaseEntity {
  type: "event";
  title: string;
  startsAt: ISODate;
  endsAt: ISODate;
  location?: string;
  attendeeIds: ID[];
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
