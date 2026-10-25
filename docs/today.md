# Today (Tasks + Calendar)

One app for "what am I doing and when". Layout agreed 2026-10-25.

## The rule: a task is its own time block

`Task.block` (start, end, IANA timezone) is what the calendar draws. Moving
or resizing the block rewrites that one task row, so the list and the
calendar can never disagree and there are no copies to reconcile.
`dueAt` is separate: plan it Monday, due Friday.

## Where things live

- `packages/today-logic`: no UI, fully tested.
  - `quick-add.ts`: "Call Sam tomorrow 3pm 30m" to title, date, time,
    length, repeat, priority and linked people. Whole words only, so
    "janky" never becomes January. Each token can be undone.
  - `recurrence.ts`: RFC 5545 RRULE subset, walked in local wall time so
    9:00 stays 9:00 across daylight saving.
  - `schedule.ts`: schedule, move, resize, unschedule, complete (repeating
    tasks move to their next date), skip one, open / done / won't do.
  - `agenda.ts`: one day's timeline (tasks + events, overlap lanes),
    "to schedule" list with overdue rolled forward, done today.
  - `provider.ts`: `CalendarProvider` interface. Local only for now;
    Google / Microsoft sync plug in here later.
- `apps/today`: the Expo app. Wide screens: menu, to-schedule list, day,
  details. Phones: week strip, tray of tasks to schedule, one timeline,
  quick add at the bottom.

## Using it

- Tap a task in "To schedule", then tap a time on the day to place it.
- Tap a block to select it; drag it to move, drag its bottom edge to change
  its length (15 minute steps).

## Not done yet

- Dragging straight from the list onto the timeline (tap then tap for now).
- Editing "this vs all future" for repeats.
- Field-level merge for offline edits on two devices (today: last write
  wins per row, which can drop one side's change).
- Upcoming and Inbox views, week and month views.
- Sync between devices: data is saved per device for now (see
  `deploy.md`).
