# Running the apps on the web, phones and desktop

| Where | How it gets there | Updates |
|---|---|---|
| Web | `.github/workflows/web.yml` runs `scripts/build-web.sh`, which builds every app with a `build:web` script into one GitHub Pages site. Today: https://avrenthrad.github.io/societyos/ · other apps: https://avrenthrad.github.io/societyos/<app>/ (e.g. `/finance/`) | Every push to `main` |
| Phone (Android / iPhone) | Open the web link, then Chrome menu > **Install app** (or **Add to Home screen**). Safari: Share > **Add to Home Screen**. Opens full screen with the phone layout. | Same as web, next time it opens |
| Desktop (Mac / Windows / Linux) | `.github/workflows/desktop.yml` builds installers with Tauri and attaches them to a GitHub release (Releases > "SocietyOS Today desktop") | The desktop app shows the live web app, so web updates appear in it straight away. Installers only rebuild when `apps/today/src-tauri/` changes |

## Data

- All the web apps live on one site, so they share one saved store: a
  bill added in Finance is a task in Today straight away, even with both
  open (each app merges before saving and listens for the other's
  changes via `PersistedStore.watchStorage()`).

- Saved on each device (browser storage via `PersistedStore` in
  `packages/sync`). Survives reloads and restarts and works offline.
- Not yet shared between devices: a task added on your phone does not
  show on your laptop. That needs the Supabase + PowerSync sync layer
  (see `stack.md`); the apps will not change, only the store behind them.
- Clearing the browser's site data deletes it.

## Adding an app to the site

Give it a `build:web` script (`expo export --platform web --output-dir dist`),
an `app.config.js` that reads `EXPO_BASE_URL`, and its own `public/`
(`index.html`, `manifest.webmanifest`, icons, and a `sw.js` whose cache
names start with the app's name, and which only deletes its own caches).
No workflow changes needed.

## One-time setup

- GitHub repo Settings > Pages > Source: **GitHub Actions**.

## Locally

```bash
pnpm dev:today                                   # dev server (press w for web)
pnpm --filter @societyos/today build:web         # static site in apps/today/dist
scripts/build-web.sh                             # every app, as published, in site/
pnpm --filter @societyos/today tauri dev         # desktop window (needs Rust)
```

## Known limits

- Desktop installers are not code-signed yet. Mac: right-click the app >
  Open the first time. Windows: SmartScreen > More info > Run anyway.
- The desktop app needs internet to load; offline use works in the
  installed web app on phones and in the browser.
