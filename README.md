# Money Makes the World Go Round

A correlation timeline. Nature, economy, politics, science, religion and thought on one
year axis, one lane per world region, from roughly 3000 BC to today.

The point is not to list events. It is to make it possible to *see* that
Tambora erupts in April 1815, that 1816 has no summer, that Europe goes hungry
and Yunnan starves, and that a financial panic follows — by putting them on the
same axis, in different lanes, and letting you drop a cursor through all of them
at once.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests and dataset validation
npm run build      # static bundle in dist/
```

`npm run build` produces a self-contained static site with relative asset paths,
so it serves correctly from a subpath such as GitHub Pages.

## Using it

- **Drag on the lower band** to select a time interval; the detail band zooms to
  it. Drag the selection to move it, its edges to resize it, and click outside
  it to restore the full range. Lane heights re-flow when you release the drag,
  so a quiet century gets room for labels.
- **Move the pointer across the detail band** to place the time cursor. The
  panel lists everything overlapping that moment, grouped by region.
- **Hover an event** for its dates, domain, region and source.
- **Toggle the chips** to filter by domain or region. Lanes re-pack; empty
  regions collapse to a labelled strip so nothing jumps.

## Handing a selection to an AI

The brush and the chips already make a precise selection over the corpus. The
**Ask** tab in the side panel turns that selection into a prompt.

Pick a purpose — explain the correlations, answer a question, find what is
missing, or draft a narrative — optionally type a question, and copy. The
prompt carries the purpose instructions, a short grounding preamble (what the
region and domain vocabularies mean, and that alignment on a timeline is not
evidence of causation), the selection's range and filters, and the events
themselves grouped by region.

**Nothing is sent from the page.** There is no backend, no API key and no
network call — it composes text and puts it on your clipboard, to paste into
Claude, ChatGPT, or a coding agent. The tab is a prompt builder, not a chat, and
it says so.

Large selections are shortened in named steps: sources and links go first, then
per-event detail, and only at the last step are events themselves dropped —
never a whole region or domain. **Whatever was cut is stated inside the prompt**,
because a digest that quietly omits two hundred events reads to a model as a
complete window. The token figure in the panel is an estimate: counting exactly
needs the token-counting endpoint, which this feature deliberately never calls.

## The data

Six curated datasets live in `public/data/`, one per domain, all sharing one
schema:

```
id,start,end,label,category,region,certainty,uncertainty,source,link
```

- `start` accepts `1815`, `1815 BC`, `1815-04`, or `1815-04-10`. A bare `-1815`
  is **rejected**: ISO 8601 reads it as 1816 BC while most historical datasets
  read it as 1815 BC, and a silent one-year skew would undermine the whole
  premise. Spell the era out.
- An empty `end` makes the event an **instant**, drawn as a dot. It stays
  empty — instants are never given a synthetic duration.
- An interval covers the full span of the precision it was written at, so
  `1939,1945` runs from the start of 1939 to the end of 1945.
- `certainty` is `exact` / `year` / `approx` / `contested`, and `uncertainty` is
  a ± in years. Uncertain dates render with a faded halo and read as `c. 1628 BC`
  rather than as a crisp bar. A contested date without a stated range fails the
  test suite.
- `region` is a closed enum: `GLOBAL`, `EUROPE`, `MIDDLE_EAST`, `AFRICA`,
  `ASIA_EAST`, `ASIA_SOUTH`, `AMERICAS`, `OCEANIA`.
- `category` is `nature`, `economy`, `politics`, `science`, `religion` or `thought`.

`npm test` validates every shipped CSV against the schema, so a malformed row is
a failing test rather than a blank lane.

### Bulk layers

Datasets too large to curate load on demand. `scripts/ingest-gvp.mjs` pulls the
Smithsonian Global Volcanism Program eruption catalogue from its WFS endpoint
and normalises it into the same schema:

```bash
npm run ingest:gvp                        # fetch from the GVP web service
npm run ingest:gvp -- saved-response.json # or replay a saved response
```

A run over the full catalogue (11,089 eruptions) yields **592 events**: only
confirmed eruptions, only VEI 4 and above — below that an eruption has no
plausible climate or economic signature — and only back to 3500 BC, so the layer
cannot stretch the axis into prehistory.

GVP's `StartDateYearUncertainty` maps straight onto our `uncertainty`, so an
eruption dated to ±500 years renders as the range it actually is. GVP writes BCE
years as plain negatives in its own convention; the script converts them to an
explicit `"2150 BC"` rather than passing a negative into a parser that would
read it one year differently.

Output goes to `public/data/gvp-volcanoes.csv` (git-ignored — generated, not
authored), which the manifest marks `bulk: true` and the UI loads only when its
chip is switched on. An eruption already written up in `nature.csv` is skipped at
ingest time, matched on volcano name and year with diacritics folded, so
switching the layer on never tells the same eruption twice; `dedupeById` is the
runtime backstop. The script fails loudly if GVP's properties or geometry do not
match what it expects, rather than quietly writing an empty file.

## How it is put together

Plain ES modules, built by Vite. The only runtime dependencies are the d3
modules actually used: `d3-selection`, `d3-scale`, `d3-brush`, `d3-array` and
`d3-dsv`.

Time is a signed decimal year in astronomical numbering — year 0 is 1 BC — on a
linear scale, not a `Date` on a time scale. `Date` cannot represent 3000 BC
without sign tricks, treats years 0–99 as 19xx, and drags in a calendar nobody
wants at that depth. Formatting back to `"1815 BC"` is a display concern.

See `CLAUDE.md` for the module map and the invariants worth knowing before
changing anything.

## Provenance

The two-band navigation-brush concept comes from the d3 timeline
proof-of-concept by [rengel-de](https://bl.ocks.org/rengel-de/5603464), which
this repository originally vendored. The philosopher dataset that shipped with
it survives as `public/data/thought.csv`. Everything else has been rewritten.
