# Tech stack

Decided 2026-10-23. Can be revisited, but changes get expensive once several
apps exist.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for apps, shared code and backend |
| Monorepo | pnpm workspaces + Turborepo | Shared packages, fast cached builds |
| Mobile + web UI | Expo (React Native) + Expo Router | One codebase for iOS, Android and web |
| Desktop | Tauri v2 wrapping each app's web build | Small, fast native installers for Mac/Windows/Linux |
| Local data | SQLite on each device | Instant, works offline |
| Sync | PowerSync (SQLite <-> Postgres) | Mature local-first sync; keeps every device in step |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) | One account across all apps, row-level security, low ops |

## Options considered

- **Flutter**: great cross-platform UI, but Dart only, smaller ecosystem
  for the web/desktop parts and for integrations (email, calendar APIs).
- **Electron for desktop**: easier, but ~10x larger installs than Tauri.
- **Separate native apps (Swift/Kotlin)**: best feel, but 3-4x the work for
  a solo builder.
- **Plain web app / PWA**: fastest to start, but weak offline, notifications
  and background sync on iOS.
- **Sync alternatives**: ElectricSQL, Zero, Triplit, Jazz. All viable; the
  `Store` interface in `packages/sync` keeps us free to switch.

## Not set up yet

- Supabase project and PowerSync instance (needs accounts).
- SQLite-backed `Store` (a browser-storage `PersistedStore` is used for now).
- Desktop: Tauri shell exists for Today (`apps/today/src-tauri`); see `deploy.md`.
