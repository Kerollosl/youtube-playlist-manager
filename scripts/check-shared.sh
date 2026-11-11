#!/bin/sh
# Verifies the two copies of the shared InnerTube helper are identical.
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
a="$here/../youtube-watch-later-sync/innertube.js"
b="$here/../youtube-playlist-manager/src/innertube.js"
if diff -u "$a" "$b"; then echo "innertube.js copies are in sync."; else echo "innertube.js copies differ: sync them." >&2; exit 1; fi
