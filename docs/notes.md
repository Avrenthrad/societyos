# Notes

Notes that work offline, file themselves, and join up with the rest of
SocietyOS. Web address once deployed: https://avrenthrad.github.io/societyos/notes/

## Writing

- Plain Markdown, saved as you type (no save button). Write and Read modes.
- `#tag` files a note; `#work/clients` nests inside `#work`.
- `@Sam Lee` links the note to that person (first name works when it is
  unique), so it shows on their timeline in People.
- `[[Another note]]` links two notes; the other note lists it under
  "Linked from". Tapping a link to a note that doesn't exist creates it.
- `- [ ] item` is a checklist. In Read mode tap **→ Today** to make it a
  task due today (linked back to the note and to anyone @mentioned). Ticking
  it in either app ticks it in the other.
- Pin to keep a note on top. Delete has a 6 second undo. A new note left
  empty is tidied away.

## Meeting notes

- Every timed event in Today shows under "Meetings today" with one tap to
  its notes.
- From 10 minutes before an event starts until it ends, its note is made
  for you: title, time, place, attendees as @mentions, then Agenda, Notes
  and Action items. Each event gets one note, once; delete it and it is not
  made again.

## Search

- One box searches every app on the device: notes, Today tasks and events,
  People, Inbox, Finance. Every word must match, in any order; titles and
  whole words rank first. Ctrl/Cmd+K jumps to it on a computer.
- Notes open in place; other results open their app.

## Layouts

- Desktop (1100px+): tags, list, note, and a "Connected" column (meeting,
  people, tasks, links, backlinks).
- iPad (700px+): list beside the note; filters as chips; Connected under
  the note.
- Phone: list, then the note full screen with Connected under it.

## Where things live

- `packages/notes-logic`: no UI, fully tested. `parse.ts` (tags, mentions,
  links, checklists), `notes.ts` (save + keep links in step, checklist to
  Today, tag tree), `meeting.ts`, `search.ts`.
- `apps/notes`: the Expo app, with its own installable web app files in
  `public/` (offline cache `notes-*`).

## Data

- Same device store as every SocietyOS app, so Notes sees Today's events
  and tasks and People's contacts with no import.
- Links use the shared `Link` entity: note → event `created-from`
  (meeting notes), note → person / note `mentions`, task → note
  `created-from`.

## Not done yet

- Sync between devices (comes with the Supabase + PowerSync layer).
  Edits to the same note on two devices offline will then need a text
  merge; for now the last save wins per note.
- Images and file attachments, note history, sharing a note.
- Desktop installer (the web app installs from Chrome/Edge: menu >
  Install).
