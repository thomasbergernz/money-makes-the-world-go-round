#!/usr/bin/env bash
# Assert the built site is self-contained.
#
# The page must not pull assets from another host and must not use absolute
# asset paths, either of which breaks it when served from a GitHub Pages
# subpath. Neither failure shows up in the unit tests, and neither is visible
# locally where the dev server serves from the domain root.
#
# Scope is the page and its bundles. dist/data/ is deliberately excluded: the
# event schema has a `link` column holding a source URL per event, which is a
# hyperlink for a reader to click, never something the page fetches. Scanning
# it made every cited Wikipedia article look like a CDN dependency.
#
# The allowlist is only what legitimately appears in the page itself: the XML
# namespace identifiers d3 emits, and the attribution link in the footer.
set -euo pipefail

DIST=${1:-dist}
ALLOWED='www\.w3\.org|bl\.ocks\.org'

fail() {
  # ::error:: is picked up by GitHub Actions and ignored elsewhere.
  echo "::error::$1"
  exit 1
}

[ -f "$DIST/index.html" ] || fail "No build found at $DIST/index.html — run the build first"

external=$(grep -rIoE 'https?://[a-zA-Z0-9./_-]+' "$DIST/index.html" "$DIST/assets" \
  | grep -vE "$ALLOWED" || true)
if [ -n "$external" ]; then
  echo "$external"
  fail "Bundle references an unexpected external URL"
fi

if grep -qE '(src|href)="/[^/]' "$DIST/index.html"; then
  fail "Bundle uses an absolute asset path; it will not serve from a subpath"
fi

echo "Bundle is self-contained."
