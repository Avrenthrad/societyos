#!/usr/bin/env bash
# Builds every app's web version into one GitHub Pages site (site/):
#   Today        -> /societyos/
#   any other app -> /societyos/<app>/   (e.g. apps/finance -> /societyos/finance/)
# An app joins by having a "build:web" script and its own public/ folder
# (manifest, sw.js, icons). All apps share one origin, so they share one
# local store and can see each other's data.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${PAGES_BASE:-/societyos}"
OUT=site
rm -rf "$OUT"
mkdir -p "$OUT"

for dir in apps/*/; do
  name="$(basename "$dir")"
  grep -q '"build:web"' "$dir/package.json" 2>/dev/null || continue
  if [ "$name" = "today" ]; then url="$BASE"; dest="$OUT"; else url="$BASE/$name"; dest="$OUT/$name"; fi
  echo "Building $name at $url/"
  (cd "$dir" && EXPO_BASE_URL="$url" pnpm run build:web)
  mkdir -p "$dest"
  cp -R "$dir/dist/." "$dest/"
done

# Let deep links load Today.
[ -f "$OUT/index.html" ] && cp "$OUT/index.html" "$OUT/404.html"
echo "Site ready in $OUT/"
