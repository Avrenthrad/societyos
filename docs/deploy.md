# Running Today on the web, phones and desktop

| Where | How it gets there | Updates |
|---|---|---|
| Web | `.github/workflows/web.yml` builds `apps/today` and publishes it to GitHub Pages: https://avrenthrad.github.io/societyos/ | Every push to `main` |
| Phone (Android / iPhone) | Open the web link, then Chrome menu > **Install app** (or **Add to Home screen**). Safari: Share > **Add to Home Screen**. Opens full screen with the phone layout. | Same as web, next time it opens |
| Desktop (Mac / Windows / Linux) | `.github/workflows/desktop.yml` builds installers with Tauri and attaches them to a GitHub release (Releases > "SocietyOS Today desktop") | The desktop app shows the live web app, so web updates appear in it straight away. Installers only rebuild when `apps/today/src-tauri/` changes |

## Data

- Saved on each device (browser storage via `PersistedStore` in
  `packages/sync`). Survives reloads and restarts and works offline.
- Not yet shared between devices: a task added on your phone does not
  show on your laptop. That needs the Supabase + PowerSync sync layer
  (see `stack.md`); the apps will not change, only the store behind them.
- Clearing the browser's site data deletes it.

## One-time setup

- GitHub repo Settings > Pages > Source: **GitHub Actions**.

## Locally

```bash
pnpm dev:today                                   # dev server (press w for web)
pnpm --filter @societyos/today build:web         # static site in apps/today/dist
pnpm --filter @societyos/today tauri dev         # desktop window (needs Rust)
```

## Known limits

- Desktop installers are not code-signed yet. Mac: right-click the app >
  Open the first time. Windows: SmartScreen > More info > Run anyway.
- The desktop app needs internet to load; offline use works in the
  installed web app on phones and in the browser.
