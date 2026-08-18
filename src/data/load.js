// Dataset loading: fetch CSV, normalise, merge, de-duplicate.

import { csvParse } from "d3-dsv";
import { normaliseDataset, dedupeById } from "./schema.js";

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
    const response = await fetch(dataset.file);
    if (!response.ok) return { events: [], errors: [], missing: true };
    text = await response.text();
  } catch {
    return { events: [], errors: [], missing: true };
  }

  if (text.trim() === "") return { events: [], errors: [], missing: false };

  const { events, errors } = normaliseDataset(csvParse(text), dataset.id);
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
