# Adopt the timeline viewer as a multi-domain correlation timeline

## Context

The repo currently holds a verbatim copy of the d3 timeline proof-of-concept from the bl.ocks.org gist `rengel-de/5603464` — five static files, d3 v3 from a plain-`http` CDN, and one dataset of philosophers.

The goal is different from what that gist does. We want to **see events and their correlations across domains, globally and regionally**: that a volcanic eruption in 1815 is followed by a European famine in 1816 and a financial panic in 1819 should be readable off the screen, not inferred. Extreme weather and natural events are a required domain, not an optional layer.

The existing viewer's core idea is worth keeping — a detail band plus a navigation band with a brush that rescales the detail view. Almost nothing else survives contact with the new requirements: d3 v3 is unmaintained and its `d3.time.scale` / `d3.svg.axis` / `d3.svg.brush` APIs are gone in v4+; the single flat item list has no notion of region or category; and the date handling breaks down well before 3000 BC.

**Outcome:** a Vite-built static site showing one lane per region, filterable by category and region, spanning 3000 BC to today, with a time cursor that answers "what else was happening at this moment, everywhere?"

### Decisions already made with the user

| Question | Decision |
|---|---|
| Domains | Nature/climate, economy/money, politics/conflict, science/tech/epidemics — alongside the existing philosophy data |
| Region dimension | Horizontal lane per region + category/region filter chips. No map. |
| Data sourcing | Curated core CSVs by default; heavy datasets as opt-in bulk layers |
| Rendering | d3 v7, `timeline.js` rewritten (not extended) |
| Time span | 3000 BC → present |
| Toolchain | Vite + npm, plain JavaScript |
| Correlation support | Visual lane alignment + vertical time cursor + overlap side panel |

Skipped the Plan subagent deliberately — the user's standing instruction is not to call the Agent tool unless asked, and the whole repo (5 files) is already in context from `/init`.

---

## The decision that everything else rests on: the time model

**Do not use `Date` or `scaleTime`.** The current `parseDate` (timeline.js:457-495) builds JS `Date` objects and papers over their limits with `new Date(year,6,1)` plus a `setUTCFullYear(("0000"+year).slice(-4))` fixup. That has three separate failure paths (negative years, years 0–99, the missing year zero) and it only survives today because the data is sparse and stops at 800 BC. At 3000 BC, with five categories and a cursor doing hit-testing on every mousemove, it becomes a bug factory.

**Represent time as a signed decimal year and use `d3.scaleLinear`.**

- Internal representation: **astronomical year numbering** — there *is* a year 0, and it means 1 BC. So `1 BC → 0`, `2 BC → -1`, `1815 BC → -1814`, `1815 AD → 1815`. Arithmetic across the era boundary is then correct with no off-by-one.
- Bare years parse to `year + 0.5` (mid-year), preserving the current convention.
- ISO `YYYY-MM-DD` parses to `year + (dayOfYear - 1) / daysInYear`.
- Display is a formatter, not a data concern: `y <= 0 → "${1 - y} BC"`, `y > 0 → "${y}"`. Applied to axis ticks, tooltips, labels, and the panel.

This deletes the entire BC branch of `parseDate`, makes brush extents and overlap tests plain number comparisons, and makes the CSV author-facing format (`"1815 BC"`, `"1815"`, `"1815-04-10"`) independent of the internal one.

The old `isNaN(dateString)` BC detection is also a trap worth killing explicitly: it silently reads `"1234 AD"` as 1234 **BC**. The new parser accepts an explicit era suffix (`BC`/`BCE`/`AD`/`CE`) or a leading `-`, and **throws on anything it cannot classify** rather than guessing.

---

## Event schema

One shared schema across every CSV, curated or ingested. First line is the header.

```
id,start,end,label,category,region,certainty,uncertainty,source,link
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable slug, unique across all files (`tambora-1815`). Used for cursor/panel keying and dedup across layers. |
| `start` | yes | `"1815"`, `"1815 BC"`, `"1815-04-10"`. Parser throws on ambiguity. |
| `end` | no | **Empty means instant** — and stays empty in the model (`end: null`). |
| `label` | yes | Short display string. |
| `category` | yes | Enum: `nature` \| `economy` \| `politics` \| `science` \| `thought`. Drives colour + filter chips. |
| `region` | yes | Closed enum (below). Drives lane assignment. |
| `certainty` | yes | `exact` \| `year` \| `approx` \| `contested`. |
| `uncertainty` | no | ± years, numeric. Renders as a faded gradient on the item's edges. |
| `source` | yes | Free text attribution. |
| `link` | no | URL. |

**`region` is a closed enum, fixed before any data is compiled:**
`GLOBAL`, `EUROPE`, `MIDDLE_EAST`, `AFRICA`, `ASIA_EAST`, `ASIA_SOUTH`, `AMERICAS`, `OCEANIA`

Fixing this up front is not bureaucracy — if the four domains get compiled independently without it, we get `Europe` / `EU` / `Western Europe` and the lanes fragment. `GLOBAL` is a real lane (rendered first, at the top), not a null value.

### Two schema rules that must not be violated

1. **Instants carry `end: null`.** The current code fakes `end = start + 100 years` (timeline.js:145) purely so instants have nonzero SVG width. With dense modern data that phantom century destroys lane packing and makes the time cursor report overlaps that never happened. Instants get a fixed *pixel* width at render time and are excluded from interval overlap math.
2. **Contested dates must not render as crisp edges.** The premise of this tool is showing correlations; a hard edge on a date that is `±100` years is exactly the lie it exists to avoid. `certainty: contested` and a non-zero `uncertainty` render with faded/gradient edges and are labelled `c. 1628 BC` in tooltips.

---

## Architecture

Vanilla ES modules under `src/`, built by Vite. No framework — the DOM here is one SVG plus a few chips and a panel.

```
index.html            Shell: filter bar, #timeline, #panel
src/main.js           Bootstrap: load data, build timeline, wire UI
src/time/year.js      parseYear / formatYear / decimal-year helpers   [pure, tested]
src/data/schema.js    Enums, validation, row -> event normalisation   [pure, tested]
src/data/load.js      d3.csv over the manifest, merge, sort
src/data/manifest.js  Which CSVs are core, which are opt-in bulk layers
src/timeline/lanes.js Region lane layout + within-lane track packing   [pure, tested]
src/timeline/bands.js Main band + navi band geometry, axis, redraw registry
src/timeline/brush.js d3.brushX on navi band -> rescale main band
src/timeline/cursor.js Vertical hairline, overlap query at year Y
src/timeline/render.js SVG item rendering (interval rect / instant dot)
src/ui/filters.js     Category + region chips -> filter state
src/ui/panel.js       "What else happened at this moment" list
src/ui/tooltip.js     Hover detail
data/*.csv            Curated core datasets
scripts/ingest-gvp.mjs Bulk-layer spike (Smithsonian volcano data)
```

**Concepts carried over from the old code, deliberately:**

- The **two-band structure** (detail band + navigation band) and the brush that drives it. This is the good idea in the original and it survives intact.
- The **redraw registry** pattern (timeline.js:251, :446) — components register themselves and get re-called on rescale. Keep it, but with **one** registry instead of the current two (`components[]` and `band.parts[]`), which is a standing footgun: a component registered in only one of them renders once and then silently stops tracking the brush.

**Concepts dropped:** the fluent `.band().xAxis().labels()` builder chain with its implicit ordering contract, the `d3.select("#band"+n)` re-selection that makes DOM ids load-bearing, the bare global `event` in the tooltip handler, and `parseDate` in its entirety.

### Lane layout

Main band is divided into region lanes, top to bottom, `GLOBAL` first. Each lane is independently track-packed: the existing greedy algorithm (`calculateTracks`, timeline.js:101) is the right approach and gets lifted into `lanes.js` as a pure function, but it runs **per lane on the filtered set**, so hiding a category re-packs and lanes shrink. Lane height is dynamic; empty lanes collapse to a thin labelled strip rather than disappearing (so vertical position stays stable while brushing).

### Correlation: the time cursor

A vertical hairline follows the mouse across the whole main band. At decimal year `Y`, `cursor.js` returns every visible event where `start <= Y <= (end ?? start)`, grouped by lane, and the side panel lists them. This is the feature that makes the tool answer its own question — at 1816 it should show Tambora (GLOBAL/nature) and the European famine (EUROPE/nature) and whatever else is in scope, in one glance.

A linear scan over the filtered set is fine at curated-core scale (low thousands). If a bulk layer pushes item count past ~20k, replace with an interval tree — noted, not built.

---

## Data plan

### Core (curated, checked into `data/`)

Target **150–250 events per domain**, selected for *participation in a nameable correlation* rather than for coverage. An event earns its place if it plausibly explains, or is explained by, something in another lane.

- `nature.csv` — volcanic eruptions (Thera, Vesuvius, Laki, Tambora, Krakatoa, Pinatubo), major earthquakes/tsunamis, climate periods as intervals (Roman Warm Period, Late Antique Little Ice Age, Medieval Warm Period, Little Ice Age, Maunder/Dalton minima), famines, floods, droughts, notable storms.
- `economy.csv` — currency and monetary regimes (Roman debasement, Song paper money, Spanish silver influx, gold standard, Bretton Woods, Nixon shock), crises and crashes (Tulip, South Sea, 1819, 1873, 1929, 1973, 2008), trade route shifts.
- `politics.csv` — wars, revolutions, treaties, empire rise/fall, colonial expansion, major migrations.
- `science.csv` — inventions and discoveries, plus epidemics and demographic shocks (Antonine Plague, Plague of Justinian, Black Death, Columbian exchange, 1918 flu, COVID).
- `thought.csv` — the existing `philosophers.csv`, migrated to the new schema with `category: thought` and per-person regions.

Migrating `philosophers.csv` is the schema's first real test: it exercises BC intervals, instants (the works), ISO dates (Rorty), and forces a region call on every row.

### Bulk layers (opt-in, not checked in)

One spike, one dataset: **Smithsonian Global Volcanism Program**. It is finite, well-dated, directly serves the Tambora example, and its licence permits redistribution. `scripts/ingest-gvp.mjs` normalises it to the same schema; the manifest marks it `bulk: true` and the UI loads it only when its chip is toggled on.

The point of the spike is to prove the schema and the manifest handle a real external dataset — **not** to build a general ingest framework. Additional sources (USGS, EM-DAT, Our World in Data) follow the same pattern later if wanted.

---

## Phases

**Phase 0 — Spec.** Write the design to `docs/superpowers/specs/2026-08-19-multi-domain-timeline-design.md` and commit it. (The brainstorming skill requires this; plan mode forbids writing it now, so it is implementation step one.)

**Phase 1 — Foundation.** Vite + npm scaffold, Vitest. `src/time/year.js` and `src/data/schema.js` with tests written first — these are pure functions and the correctness of everything downstream depends on them. Migrate `philosophers.csv` → `data/thought.csv`. No rendering yet; success is a loaded, validated, normalised event array.

**Phase 2 — Viewer core.** d3 v7. Region lanes, track packing, main + navi bands, linear year axis with the BC formatter, brush rescaling. Renders `thought.csv` alone. At this point the old `timeline.js`, `timeline.css`, and `philosophers.csv` are deleted.

**Phase 3 — Interaction.** Category/region filter chips with re-packing, tooltip, time cursor + overlap panel, certainty rendering.

**Phase 4 — Data.** Compile `nature.csv`, `economy.csv`, `politics.csv`, `science.csv`. Largest phase by wall-clock, but it has no unknowns once Phases 1–3 land.

**Phase 5 — Bulk spike.** `scripts/ingest-gvp.mjs`, manifest `bulk` flag, on-demand layer toggle.

Phases 1–3 are the viewer and are independently useful. Phase 4 can start once Phase 1 fixes the schema, and can proceed in parallel.

### Files removed

`timeline.js`, `timeline.css`, `philosophers.csv` (migrated), and the current `index.html` body script. `README.md` is rewritten but **keeps the attribution to `rengel-de/5603464`** — the two-band brush concept came from there. `CLAUDE.md` is rewritten in Phase 2, since most of what it documents is the code being deleted.

---

## Verification

**Unit (Vitest), the parts where correctness is not eyeballable:**

- `year.js` round-trips: `"3000 BC" → -2999 → "3000 BC"`; `"1 BC" → 0 → "1 BC"`; `"1" → 1 → "1"`; `"50" → 50 → "50"` (not 1950); `"1815-04-10" → ~1815.27`. `"1234 AD"` parses as **AD**, and a bare `"1234 CE"` too. Ambiguous input throws.
- `schema.js`: an unknown `region` or `category` is a hard error, not a silent lane; empty `end` yields `end: null` and never a synthesised value.
- `lanes.js`: no two items in the same lane and track overlap in time; instants do not consume interval width.

**End-to-end, in the browser (`npm run dev`):**

1. **Axis across the era boundary.** Zoom so the axis spans 3000 BC → 2000 AD and confirm ticks read `3000 BC`, `2000 BC`, `1000 BC`, `1 BC`, `1`, `1000`, `2000` — no `-1815`, no year `0`, no `1950` where `50` belongs.
2. **Brush drives every lane.** Drag a brush on the navi band; all region lanes rescale together and stay vertically aligned. Click outside the brush restores the full range. This is the specific thing the old dual-registry bug broke.
3. **The correlation the tool exists for.** Place the time cursor at 1816. The panel must list Tambora (GLOBAL / nature) *and* the European famine (EUROPE / nature) *and* whatever politics/economy events overlap — across lanes, in one view. Then check 1348 (Black Death) and 536 (Late Antique Little Ice Age) the same way.
4. **Filtering re-packs.** Toggle `nature` off; nature items vanish, remaining lanes re-pack tighter, empty lanes collapse to labelled strips without the other lanes jumping.
5. **Instants are not centuries.** Hover an instant (e.g. a published work); the tooltip shows a single year, and the time cursor 50 years later does *not* list it.
6. **Contested dates look contested.** The Thera eruption renders with faded edges and reads `c. 1628 BC`, not a crisp bar.
7. **Bulk layer.** Toggle the GVP layer on; volcano events appear in the correct region lanes without duplicating the curated Tambora entry (id dedup).

**Build:** `npm run build` produces a static bundle that serves correctly from a subpath (GitHub Pages), with no `http://` asset references.
