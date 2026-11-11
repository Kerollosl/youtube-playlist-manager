#!/bin/sh
# Builds dist/<name>-<version>.zip with only the shipping files.
set -e
cd "$(dirname "$0")/.."
sh scripts/check-shared.sh
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -1)
out="dist/youtube-playlist-manager-$version.zip"
mkdir -p dist
rm -f "$out"
zip -X -q "$out" manifest.json icons/icon16.png icons/icon48.png icons/icon128.png \
  src/background.js src/content.js src/innertube.js src/job-store.js src/operations.js \
  src/page.css src/selection.js src/timings.js src/ui.css src/youtube-api.js src/youtube-view.js \
  src/watch-later.js src/watch-later-worker.js src/popup.html src/popup.js src/popup.css
echo "Wrote $out"
unzip -l "$out"
