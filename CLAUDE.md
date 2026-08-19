# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on :5173
npm test             # Vitest: unit tests + validation of every shipped CSV
npm run test:watch   # watch mode
npx vitest run test/year.test.js          # one file
npx vitest run -t "rejects the bare-minus" # one test by name
npm run build        # static bundle in dist/ (relative base, subpath-safe)
npm run ingest:gvp   # regenerate the committed bulk volcano layer
```

## What this is

A multi-domain correlation timeline: six domains (`nature`, `economy`,
`politics`, `science`, `thought`) laid out in one horizontal lane per world
region, on a shared year axis from ~3000 BC to today. A navigation band with a
brush drives the detail band; a time cursor reports everything overlapping one
moment across every lane.

The repository began as a vendored copy of the d3 v3 proof-of-concept
`rengel-de/5603464`. Only the two-band brush *concept* survives; the code, the
data model and the datasets were rewritten.

## The time model — read this before touching dates

Time is a **signed decimal year in astronomical numbering** on a
`d3-scale` `scaleLinear`. Year 0 means 1 BC, -1 means 2 BC. There is no gap at
the era boundary, so durations, overlap tests and brush extents are plain
arithmetic.

`Date` and `scaleTime` are deliberately absent. `Date` cannot represent years
before 1 AD without sign tricks, silently maps years 0–99 to 19xx, and carries a
calendar that means nothing at 3000 BC. Reintroducing either would undo the
correctness the rest of the system rests on.

`src/time/year.js` is the whole model:

- `parseYear(text)` → the **midpoint** of the span the text names. Used for
  instants and for anything that wants a single representative point.
- `parseYearSpan(text)` → `[start, end]` covering the full span at the precision
  written. This is why `1816,1816` is a whole year rather than a zero-width
  interval no cursor could ever hit. The upper bound is nudged a hair inside the
  span so formatting it yields the year that was written.
- `formatYear(year, {circa})` → `"1815"`, `"1815 BC"`, `"c. 1628 BC"`. Never
  emits a negative number or a year `0`.

The parser **throws rather than guesses**. In particular a bare `-1815` is
rejected: ISO 8601 reads it as 1816 BC, while the original viewer and the
Smithsonian volcano data read it as 1815 BC. A silent one-year skew is invisible
on screen and fatal to a tool whose entire claim is that events line up. Ingest
scripts convert their source's convention explicitly.

## Architecture

```
src/main.js             bootstrap: load, wire UI, handle bulk-layer toggles
src/time/year.js        the time model                        [pure, tested]
src/data/schema.js      enums, validation, row -> event       [pure, tested]
src/data/manifest.js    which datasets are core, which are bulk
src/data/load.js        fetch + normalise + merge + dedupe
src/timeline/axis.js    year ticks on round historical years  [pure, tested]
src/timeline/lanes.js   region lanes + track packing          [pure, tested]
src/timeline/cursor.js  overlap query at one year             [pure, tested]
src/timeline/bands.js   SVG shell, scales, axes, redraw registry
src/timeline/render.js  item rendering (interval rect / instant dot)
src/timeline/brush.js   d3-brushX on the navigation band
src/timeline/timeline.js composes the above into the public API
src/selection/selection.js  derives the current selection      [pure, tested]
src/selection/digest.js     prompt assembly + the cap ladder   [pure, tested]
src/ui/                 filters, cursor panel, ask tab, tabs, tooltip, theme
public/data/*.csv       the datasets, served as static files
scripts/ingest-gvp.mjs  bulk-layer ingest spike
```

The pure modules carry the logic and the tests; the rest is DOM wiring. Keep it
that way — anything worth asserting belongs in a module that does not need a
browser.

### Invariants

- **One redraw registry.** `bands.js` has exactly one list of redraw callbacks.
  The v3 original had two (initial paint and brush), and a component registered
  in only one would render once and then silently stop tracking the brush. Do
  not add a second.
- **Instants carry `end: null`.** They are drawn at a fixed *pixel* radius and
  are excluded from interval overlap maths. The v3 original substituted
  `start + 100 years` so instants had drawable width; that phantom century
  wrecks lane packing and makes the cursor report overlaps that never happened.
- **`region` and `category` are closed enums** in `schema.js`. An unknown value
  is a hard error, never a new lane. Fragmenting `EUROPE` / `Europe` / `EU`
  across independently compiled datasets is the failure this prevents.
- **Uncertain dates must not render crisp.** `certainty: contested` requires a
  non-zero `uncertainty`, enforced by `test/data.test.js`. Drawing a ±100-year
  date as a hard edge is exactly the lie this tool exists to avoid.
- **Lane packing follows the visible window**, recomputed on brush *end* only.
  Packing the whole corpus makes a quiet century unreadable; packing during the
  drag makes lanes jump under the pointer driving them.
- **The selection is derived, never stored.** `buildSelection()` reads the
  visible range and events from the timeline and the filters from the chips.
  `rebuildLanes()` already runs at exactly the moments a selection changes and
  fires `onWindowChange`; do not add a second listener or a mirrored selection
  object. That mirroring is what made the navigation band and the detail band
  disagree twice.
- **The digest states what it dropped.** `digest.js` degrades a large selection
  in named rungs and writes the loss into the prompt. It never drops a region
  or a domain that has events — at the last rung each domain keeps a
  representative even if that exceeds the per-region target. A digest that
  omits events silently is the same class of lie as a synthetic duration.
- **The GVP layer is committed, not built at deploy time.** It is refreshed
  monthly by `.github/workflows/refresh-gvp.yml`, which commits only when the
  regenerated file differs and then republishes. Regenerating on every deploy
  hammered a public research service for a byte-identical result and made two
  deploys of one commit able to publish different data.
- **The Ask tab makes no network calls.** No API key, no backend, no requests.
  If that ever changes, the panel's copy has to change with it — it currently
  promises the page sends nothing.
- **Curated events win id collisions.** `dedupeById` is first-wins and curated
  datasets load first, so a bulk layer can never double a hand-curated event.
  `ingest-gvp.mjs` also skips eruptions already present in `nature.csv`, matched
  on name and year, because ids from two independent sources will not collide on
  their own.
- **The loader trusts the header row, not the status code.** A dev server that
  falls back to `index.html` answers 200 for a missing CSV, and the parser would
  turn that HTML into hundreds of junk rows.

## Verifying changes in a browser

Most of this project cannot be checked by unit tests. Lane packing, the brush,
the time cursor and the deployed base path are all only true on a page, so
verification means driving a real browser. Two conventions keep that from
swallowing the session:

**Delegate the sweep to a subagent.** This is the only thing that actually
saves context. `browser_run_code_unsafe` echoes the script back in its result
whether it was passed inline or read from a file via `filename` — that was
measured, not assumed, and the file route saves nothing on its own. What does
work is running the sweep inside a subagent: the script echo and the raw DOM
output land in its context, and only the verdict comes back.

Keeping the script in `.playwright-mcp/` (git-ignored) is still worth doing so
a check is repeatable and reviewable rather than retyped each time — just do
not expect it to reduce context by itself.

**Keep the debugging inline.** A routine "does the live site still
work" pass — load, count events, check the axis, toggle a filter, exercise the
Ask tab — belongs in a subagent that reports pass/fail. Debugging does not:
every real bug found here was identified from one specific line of raw output
that a summary would have thrown away.

Return counts and booleans once a check is routine. Returning whole objects is
worth it the first time, when you do not yet know what to assert — that is how
the footer was caught claiming "634 of 634 shown" while 52 events were visible.

The checks worth running against a deploy:

- event count matches the footer, and the axis reads `3500 BC … 1 … 2000` with
  no negative labels and no year zero
- the brush rescales every lane together and the selection rect agrees with the
  detail band after a window resize
- a filter toggle re-packs lanes and empty regions collapse to labelled strips
- the time cursor at 1816 lists Tambora's consequences across several lanes
- the GVP chip loads the bulk layer without duplicating curated Tambora
- the Ask tab produces a prompt containing the grounding preamble

## Data

`public/data/*.csv`, one file per domain, all on the schema documented in
`README.md`. `test/data.test.js` validates every shipped file — schema
conformance, globally unique ids, time scope, contested-date ranges, and that
every region and category is represented. A malformed row is a failing test, not
a runtime surprise.

When adding events, prefer ones that participate in a correlation you can name
over ones that merely fill coverage. The timeline is only worth its screen space
where the lanes explain each other.
