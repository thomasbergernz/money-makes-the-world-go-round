// Application entry point: load the data, build the timeline, wire the UI.

import "./styles.css";
import { CORE_DATASETS, BULK_DATASETS, DATASETS } from "./data/manifest.js";
import { loadDatasets } from "./data/load.js";
import { dedupeById } from "./data/schema.js";
import { createTimeline } from "./timeline/timeline.js";
import { createFilters, applyFilters } from "./ui/filters.js";
import { createPanel } from "./ui/panel.js";
import { createTooltip } from "./ui/tooltip.js";
import { createTabs } from "./ui/tabs.js";
import { createAsk } from "./ui/ask.js";
import { buildSelection } from "./selection/selection.js";

boot().catch((error) => {
  console.error(error);
  document.querySelector("#status").textContent = `Failed to start: ${error.message}`;
});

async function boot() {
  const timelineEl = document.querySelector("#timeline");
  const filtersEl = document.querySelector("#filters");
  const panelEl = document.querySelector("#panel");
  const askEl = document.querySelector("#ask");
  const statusEl = document.querySelector("#status");

  const panel = createPanel(panelEl);
  const ask = createAsk(askEl);
  const tooltip = createTooltip(document.body);
  createTabs(document.querySelector(".panel"), [
    { id: "panel", label: "Moment" },
    { id: "ask", label: "Ask" },
  ]);

  // The latest window reported by the timeline. Held only so the filter state
  // can be folded in — the timeline remains the owner.
  let latestWindow = null;
  let filterState = null;
  let visibleCount = 0;

  const timeline = createTimeline(timelineEl, {
    height: Math.max(420, window.innerHeight - 240),
    onCursor: (info) => panel.update(info),
    onHover: (event, position) => tooltip.show(event, position),
    onWindowChange(next) {
      latestWindow = next;
      publishSelection();
      updateStatus();
    },
  });

  function publishSelection() {
    if (!latestWindow || !filterState) return;
    ask.setSelection(buildSelection(latestWindow, filterState));
  }

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

  filterState = state;
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
    visibleCount = applyFilters(corpus, state).length;
    timeline.setVisible(applyFilters(corpus, state));
    publishSelection();
    updateStatus();
  }

  /**
   * Three numbers that are genuinely different: what the brush is showing,
   * what survives the filters, and the whole corpus. Reporting only the last
   * two claimed "634 of 634 shown" while 52 events were on screen.
   */
  function updateStatus() {
    const inView = latestWindow ? latestWindow.events.length : visibleCount;
    const filtered = `${visibleCount.toLocaleString()} of ${corpus.length.toLocaleString()} after filters`;
    statusEl.textContent =
      inView === visibleCount
        ? `${filtered}`
        : `${inView.toLocaleString()} in view · ${filtered}`;
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
