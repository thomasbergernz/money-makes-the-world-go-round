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
npm run ingest:gvp   # regenerate the optional bulk volcano layer
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
src/ui/                 filters, cursor panel, tooltip, theme
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
- **Curated events win id collisions.** `dedupeById` is first-wins and curated
  datasets load first, so a bulk layer can never double a hand-curated event.
  `ingest-gvp.mjs` also skips eruptions already present in `nature.csv`, matched
  on name and year, because ids from two independent sources will not collide on
  their own.
- **The loader trusts the header row, not the status code.** A dev server that
  falls back to `index.html` answers 200 for a missing CSV, and the parser would
  turn that HTML into hundreds of junk rows.

## Data

`public/data/*.csv`, one file per domain, all on the schema documented in
`README.md`. `test/data.test.js` validates every shipped file — schema
conformance, globally unique ids, time scope, contested-date ranges, and that
every region and category is represented. A malformed row is a failing test, not
a runtime surprise.

When adding events, prefer ones that participate in a correlation you can name
over ones that merely fill coverage. The timeline is only worth its screen space
where the lanes explain each other.
