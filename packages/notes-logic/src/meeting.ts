import type { CalendarEvent, Note } from "@societyos/core";
import type { Store } from "@societyos/sync";
import { link } from "@societyos/sync";
import { newNote, saveNote, type Ctx } from "./notes.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const day = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** How long before an event starts its notes are made for you. */
export const MEETING_LEAD_MIN = 10;

/** The note made for an event, if it still exists. */
export async function meetingNoteFor(store: Store, eventId: string): Promise<Note | undefined> {
  const links = await store.list("link", (l) => l.toId === eventId && l.relation === "created-from");
  for (const l of links) {
    const n = await store.get("note", l.fromId);
    if (n) return n;
  }
  return undefined;
}

/** Has a note ever been made for this event? (True even if it was later deleted.) */
async function everMade(store: Store, eventId: string) {
  const links = await store.list("link", (l) => l.toId === eventId && l.relation === "created-from");
  for (const l of links) if (l.sourceApp === "notes" || (await store.get("note", l.fromId))) return true;
  return false;
}

/** The starting text of a meeting note: when, where, who, then space to write. */
export async function meetingTemplate(store: Store, event: CalendarEvent): Promise<{ title: string; body: string }> {
  const s = new Date(event.startsAt);
  const e = new Date(event.endsAt);
  const people = (await Promise.all(event.attendeeIds.map((id) => store.get("person", id)))).filter((p) => !!p);
  const lines = [
    "#meeting",
    "",
    `**When:** ${day(s)}${event.allDay ? "" : `, ${time(s)}–${time(e)}`}`,
    ...(event.location ? [`**Where:** ${event.location}`] : []),
    ...(people.length ? [`**With:** ${people.map((p) => `@${p.name}`).join(", ")}`] : []),
    "",
    "## Agenda",
    "- ",
    "",
    "## Notes",
    "",
    "",
    "## Action items",
    "- [ ] ",
  ];
  return { title: `${event.title} – ${day(s)}`, body: lines.join("\n") };
}

/**
 * Open (or make) the notes for an event. Linked to the event, and to its
 * attendees through their @mentions, so People shows it on their timeline.
 */
export async function openMeetingNote(store: Store, event: CalendarEvent, ctx: Ctx): Promise<Note> {
  const existing = await meetingNoteFor(store, event.id);
  if (existing) return existing;
  const note = newNote(ctx, await meetingTemplate(store, event));
  await store.put(note);
  await link(store, note, event, "created-from", ctx);
  return saveNote(store, note, {}, ctx);
}

/** Today's timed events, earliest first, with their notes where they have them. */
export async function meetingsOn(store: Store, date: Date): Promise<{ event: CalendarEvent; note?: Note }[]> {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const events = await store.list("event", (e) => !e.allDay && new Date(e.startsAt) < to && new Date(e.endsAt) > from);
  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return Promise.all(events.map(async (event) => ({ event, note: await meetingNoteFor(store, event.id) })));
}

/**
 * Make notes for any meeting starting in the next few minutes or already
 * under way, so they are ready when you open the app. Each event gets one
 * note, once: if you delete it, it is not made again.
 */
export async function autoMeetingNotes(store: Store, ctx: Ctx, now = new Date()): Promise<Note[]> {
  const soon = new Date(now.getTime() + MEETING_LEAD_MIN * 60_000);
  const events = await store.list("event", (e) => !e.allDay && new Date(e.startsAt) <= soon && new Date(e.endsAt) > now);
  const made: Note[] = [];
  for (const e of events) {
    if (await everMade(store, e.id)) continue;
    made.push(await openMeetingNote(store, e, ctx));
  }
  return made;
}
