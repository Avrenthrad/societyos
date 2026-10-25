# People

The people in your life, with as little typing as possible. Web address
once deployed: https://avrenthrad.github.io/societyos/people/

## The rule: People fills itself

Nothing on a person's timeline is entered in People. It shows anything
from any app that is

- linked to them (`link()`, any relation, either direction),
- an event they attend (`CalendarEvent.attendeeIds`),
- a message from or to them (`Message.fromId` / `toIds`),
- text that names them in full ("Dinner with Sam Lee"; first names alone
  are too easy to match by accident).

"Last in touch" is the latest past event, message, finished task or
payment with them, or a "Caught up today" tap, whichever is newest.

## Where things live

- `packages/people-logic`: no UI, fully tested.
  - `timeline.ts`: every person's timeline in one pass over the store.
  - `keep-in-touch.ts`: who is due a catch-up. Never-contacted people count
    from when they were added, so importing contacts doesn't flood the
    list; anyone with a plan (event coming up, open catch-up task) is
    skipped.
  - `birthdays.ts`: stored as `YYYY-MM-DD` or `--MM-DD` (year unknown).
    29 Feb falls on 28 Feb in other years.
  - `vcard.ts`: reads `.vcf` exports from phones, Google and Outlook, on
    the device. Merges into existing people (email, phone, then name) and
    only fills gaps.
  - `quick-add.ts`: "Sam Lee bday 12 Mar every 2 weeks #friends".
  - `people.ts`: `findOrCreatePerson()` (other apps use this so People never
    gets duplicates), catch-up and birthday tasks for Today.
- `apps/people`: the Expo app. Desktop: menu, list, person. iPad: list +
  person. Phone: list, or one person full screen, add at the bottom.

## Shared with other apps

- All apps on the same web address share one saved store on the device, so
  Today's events and tasks reach People with no setup.
- "Plan a catch-up" and "Birthday reminder" put tasks on Today, linked to
  the person (the birthday one repeats yearly).

## Not done yet

- Merge two people into one; photos.
- Pull birthdays from Google / Microsoft contacts (needs sign-in, planned
  with device sync).
- Birthdays shown directly on Today's timeline without a task.
