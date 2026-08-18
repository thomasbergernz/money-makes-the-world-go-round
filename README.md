# Money Makes the World Go Round

A correlation timeline. Nature, economy, politics, science and thought on one
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

## The data

Five curated datasets live in `public/data/`, one per domain, all sharing one
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
- `category` is `nature`, `economy`, `politics`, `science` or `thought`.

`npm test` validates every shipped CSV against the schema, so a malformed row is
a failing test rather than a blank lane.

### Bulk layers

Datasets too large to curate load on demand. `scripts/ingest-gvp.mjs` normalises
the Smithsonian Global Volcanism Program eruption catalogue into the same
schema:

```bash
npm run ingest:gvp                       # fetch from the GVP web service
npm run ingest:gvp -- path/to/export.csv # or use a local export
```

It writes `public/data/gvp-volcanoes.csv`, which the manifest marks `bulk: true`
and the UI loads only when its chip is switched on. Curated events win any id
collision, so switching the layer on never doubles an event you already curated.

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
