# SocietyOS

A suite of apps (notes, inbox, tasks, calendar, people, ...) that run on
phone, tablet, desktop and web, and share one set of data so they work
better together.

## Layout

```
apps/           one folder per app (each runs on iOS, Android, web, desktop)
  notes/        first starter app
packages/
  core/         shared data model: people, events, tasks, notes, messages,
                money, places, files, and links between them
  sync/         the Store every app reads/writes, links, cross-app search
  ui/           design tokens (colours, spacing, type) shared by all apps
docs/
  stack.md          what we use and why
  architecture.md   how the apps share data and talk to each other
  adding-an-app.md  checklist for a new app
```

## Getting started

```bash
pnpm install
pnpm test            # runs the shared package tests
pnpm dev:notes       # starts the Notes app (press w for web, i/a for phone)
```

Inside `apps/notes`, run `npx expo install --fix` once to align Expo
package versions with the current Expo SDK.
