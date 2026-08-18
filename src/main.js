// Application entry point: load the data, build the timeline, wire the UI.

import "./styles.css";
import { CORE_DATASETS, BULK_DATASETS, DATASETS } from "./data/manifest.js";
import { loadDatasets } from "./data/load.js";
import { dedupeById } from "./data/schema.js";
import { createTimeline } from "./timeline/timeline.js";
import { createFilters, applyFilters } from "./ui/filters.js";
import { createPanel } from "./ui/panel.js";
import { createTooltip } from "./ui/tooltip.js";

boot().catch((error) => {
  console.error(error);
  document.querySelector("#status").textContent = `Failed to start: ${error.message}`;
});

async function boot() {
  const timelineEl = document.querySelector("#timeline");
  const filtersEl = document.querySelector("#filters");
  const panelEl = document.querySelector("#panel");
  const statusEl = document.querySelector("#status");

  const panel = createPanel(panelEl);
  const tooltip = createTooltip(document.body);

  const timeline = createTimeline(timelineEl, {
    height: Math.max(420, window.innerHeight - 200),
    onCursor: (info) => panel.update(info),
    onHover: (event, position) => tooltip.show(event, position),
  });

  const core = await loadDatasets(CORE_DATASETS);
  report(core);

  /** Bulk layers, loaded lazily and cached by dataset id. */
  const bulkCache = new Map();
  let corpus = [];

  const { state } = createFilters(filtersEl, {
    bulkDatasets: BULK_DATASETS,
    onChange: refresh,
    async onBulkToggle(id) {
      if (!bulkCache.has(id)) {
        const dataset = DATASETS.find((entry) => entry.id === id);
        const result = await loadDatasets([dataset]);
        report(result);
        bulkCache.set(id, result.events);
      }
      rebuildCorpus();
      refresh();
    },
  });

  rebuildCorpus();
  refresh();

  function rebuildCorpus() {
    // Curated events come first, so switching a bulk layer on can never double
    // an event that was already curated by hand under the same id.
    const bulkEvents = [...bulkCache]
      .filter(([id]) => state.bulk.has(id))
      .flatMap(([, events]) => events);
    corpus = dedupeById([...core.events, ...bulkEvents]).sort((a, b) => a.start - b.start);
    timeline.setData(corpus);
  }

  function refresh() {
    const visible = applyFilters(corpus, state);
    timeline.setVisible(visible);
    statusEl.textContent = `${visible.length.toLocaleString()} of ${corpus.length.toLocaleString()} events shown`;
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => timeline.resize(), 150);
  });
}

function report({ errors, missing }) {
  for (const error of errors) console.error(`[data] ${error}`);
  for (const id of missing) console.info(`[data] ${id} not present yet — skipped`);
}
