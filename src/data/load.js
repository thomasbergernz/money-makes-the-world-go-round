// Dataset loading: fetch CSV, normalise, merge, de-duplicate.

import { csvParse } from "d3-dsv";
import { normaliseDataset, dedupeById, REQUIRED_COLUMNS } from "./schema.js";

/**
 * The build stamp, injected by Vite. Falls back to a literal when the module is
 * imported outside a Vite build, such as from a unit test.
 */
const DATA_VERSION = typeof __DATA_VERSION__ === "string" ? __DATA_VERSION__ : "dev";

/**
 * A dataset URL carrying the build stamp.
 *
 * Without it a returning visitor keeps their cached copy of a CSV after a
 * deploy has changed it — the bundles bust themselves via content-hashed
 * filenames, but these files sit at stable paths and would not.
 */
export function dataUrl(file) {
  return `${file}?v=${DATA_VERSION}`;
}

/**
 * Load and normalise one dataset.
 *
 * A missing file is not an error — datasets are compiled incrementally and the
 * viewer must run with whatever exists. A malformed row is an error, reported
 * with its file and line and skipped, so one bad row cannot blank the view.
 *
 * @param {{id: string, file: string}} dataset
 * @returns {Promise<{events: Array, errors: string[], missing: boolean}>}
 */
export async function loadDataset(dataset) {
  let text;
  try {
    const response = await fetch(dataUrl(dataset.file));
    if (!response.ok) return { events: [], errors: [], missing: true };
    text = await response.text();
  } catch {
    return { events: [], errors: [], missing: true };
  }

  if (text.trim() === "") return { events: [], errors: [], missing: false };

  // A dev server that falls back to index.html answers 200 for a file that is
  // not there, and the CSV parser will happily turn that HTML into hundreds of
  // junk rows. Trust the header row, not the status code.
  const rows = csvParse(text);
  const columns = rows.columns ?? [];
  if (!REQUIRED_COLUMNS.every((column) => columns.includes(column))) {
    return { events: [], errors: [], missing: true };
  }

  const { events, errors } = normaliseDataset(rows, dataset.id);
  return { events, errors, missing: false };
}

/**
 * Load several datasets concurrently and merge them.
 *
 * Order matters for de-duplication: curated events win over bulk-layer events
 * carrying the same id, so switching a bulk layer on never doubles an event
 * that was already curated by hand.
 *
 * @param {Array<{id: string, file: string}>} datasets
 * @returns {Promise<{events: Array, errors: string[], missing: string[]}>}
 */
export async function loadDatasets(datasets) {
  const results = await Promise.all(datasets.map(loadDataset));

  const events = dedupeById(results.flatMap((result) => result.events));
  events.sort((a, b) => a.start - b.start);

  return {
    events,
    errors: results.flatMap((result) => result.errors),
    missing: datasets.filter((_, i) => results[i].missing).map((dataset) => dataset.id),
  };
}
