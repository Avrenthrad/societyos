# How the apps fit together

## One data model

Every app uses the entity types in `packages/core`. If two apps could both
care about something (a person, a task, a meeting), it lives in core, not in
one app. This is what lets the inbox turn an email into a task, or the
calendar show the notes for a meeting.

## One store, local-first

```
 App UI  ->  Store (packages/sync)  ->  SQLite on device
                    ^                         |
                    |  changes from other     v
                    +---- apps & devices <- PowerSync <-> Supabase Postgres
```

- Apps only talk to the `Store`. They never call the server directly.
- Writes go to the device first, so every action is instant and works offline.
- Sync runs in the background. Conflicts: last write wins (by `updatedAt`).
- Deletes are soft (`deletedAt`) so they reach every device.

## Apps talking to each other

- **Subscribe**: `store.subscribe()` reports every change, wherever it came
  from. The calendar can react when the inbox creates an event.
- **Links**: `link(store, a, b, "created-from", ...)` joins any two entities.
  `linksFor(store, id)` shows everything connected to something, which is how
  any app can show "related" items from the others.
- **sourceApp**: every entity records which app made it.

## One account

Supabase Auth gives one login for every SocietyOS app. Row-level security
makes sure each person only syncs their own data.

## Shared entities

People, events, tasks, notes, messages, money (`transaction`), places and
files, plus `link` to join any two. Cross-app search: `searchAll(store, q)`.

## Build order (proposed, not yet confirmed)

1. Shared foundation (this repo: core, sync, ui, quick capture, search)
2. Tasks + Calendar
3. Notes
4. People
5. Later: Inbox, Finance, Health, Messaging

Integrate with accounts people already have (Gmail, WhatsApp, Google
Calendar) rather than asking them to move to new networks.
