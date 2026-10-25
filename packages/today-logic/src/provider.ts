import type { CalendarEvent } from "@societyos/core";
import type { Store } from "@societyos/sync";

/**
 * Where calendar events come from. v1 ships local-only; Google and
 * Microsoft two-way sync will be more providers behind this same shape,
 * writing their events into the Store (with `event.external` set) so every
 * app sees them without knowing where they came from.
 */
export interface CalendarProvider {
  id: string;
  name: string;
  listEvents(from: Date, to: Date): Promise<CalendarEvent[]>;
  saveEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
}

/** Events kept only in SocietyOS's own store. */
export class LocalCalendarProvider implements CalendarProvider {
  id = "local";
  name = "SocietyOS";
  constructor(private store: Store) {}

  listEvents(from: Date, to: Date) {
    return this.store.list(
      "event",
      (e) => !e.external && new Date(e.startsAt) < to && new Date(e.endsAt) > from,
    );
  }

  saveEvent(event: CalendarEvent) {
    return this.store.put(event);
  }

  deleteEvent(id: string) {
    return this.store.remove("event", id);
  }
}
