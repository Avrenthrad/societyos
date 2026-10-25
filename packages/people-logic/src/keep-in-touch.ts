import type { ID, Person } from "@societyos/core";
import type { PersonActivity, TimelineEntry } from "./timeline.js";

const DAY = 86_400_000;

/** Choices offered in the app. Days, so any cadence can be stored. */
export const CADENCES = [
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 90, label: "Every 3 months" },
  { days: 180, label: "Every 6 months" },
  { days: 365, label: "Every year" },
] as const;

export function cadenceLabel(days: number): string {
  return CADENCES.find((c) => c.days === days)?.label ?? `Every ${days} days`;
}

export interface ReachOut {
  person: Person;
  lastContact?: Date;
  /** When it fell (or falls) due. */
  dueOn: Date;
  /** Days past due; 0 means due today. */
  overdueDays: number;
}

/**
 * Already in hand: an event with them still to come, or an open task tied to
 * them for today or later ("Catch up with Sam"). A mere mention ("Sam Lee's
 * gig") doesn't count.
 */
function hasPlans(a: PersonActivity | undefined, now: Date): boolean {
  if (!a) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isPlan = (x: TimelineEntry) =>
    x.via !== "mention" &&
    (x.kind === "event" || (x.kind === "task" && !x.contact && x.detail !== "Won't do")) &&
    x.at >= today;
  return a.upcoming.some(isPlan) || a.past.some(isPlan);
}

/**
 * Who to reach out to: people with a keep-in-touch cadence whose last
 * contact (found automatically, or logged by hand) is older than it.
 * Someone never contacted counts from when they were added, so importing
 * a whole address book doesn't make everyone due at once.
 */
export function reachOutList(people: Person[], activity: Map<ID, PersonActivity>, now: Date = new Date()): ReachOut[] {
  const out: ReachOut[] = [];
  for (const person of people) {
    const days = person.keepInTouchDays;
    if (!days || days <= 0) continue;
    const lastContact = activity.get(person.id)?.lastContact;
    if (hasPlans(activity.get(person.id), now)) continue;
    const from = lastContact ?? new Date(person.createdAt);
    const dueOn = new Date(from.getTime() + days * DAY);
    const overdueDays = Math.floor((now.getTime() - dueOn.getTime()) / DAY);
    if (overdueDays >= 0) out.push({ person, lastContact, dueOn, overdueDays });
  }
  // Most overdue relative to their cadence first: a weekly friend 2 weeks late beats a yearly one 3 weeks late.
  const lateness = (r: ReachOut) => r.overdueDays / (r.person.keepInTouchDays ?? 1);
  return out.sort((a, b) => lateness(b) - lateness(a) || a.person.name.localeCompare(b.person.name));
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "4 months ago", "over a year ago". */
export function formatAgo(d: Date, now: Date = new Date()): string {
  const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "over a year ago";
}
