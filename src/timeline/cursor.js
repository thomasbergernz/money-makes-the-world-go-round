// The time cursor: what was happening everywhere at one moment.
//
// This is the feature the timeline exists for. Lanes aligned on a shared axis
// let you see correlations; the cursor is what lets you read one off.

import { REGIONS, REGION_LABELS, eventEnd } from "../data/schema.js";

/**
 * Every event overlapping `year`, grouped by region in lane order.
 *
 * Instants have no duration, so a bare containment test would make them almost
 * impossible to hit. They match within `tolerance` years, which the caller
 * derives from a pixel radius at the current zoom — so an instant stays as
 * easy to hit when zoomed out as when zoomed in, without ever claiming to span
 * a period it did not.
 *
 * @param {Array} events already filtered to what is visible
 * @param {number} year decimal astronomical year
 * @param {{tolerance?: number}} [options]
 * @returns {Array<{region: string, label: string, events: Array}>} non-empty groups only
 */
export function eventsAt(events, year, options = {}) {
  const { tolerance = 0 } = options;

  const hits = events.filter((event) =>
    event.instant
      ? Math.abs(event.start - year) <= tolerance
      : event.start <= year && year <= eventEnd(event),
  );

  const byRegion = new Map();
  for (const event of hits) {
    if (!byRegion.has(event.region)) byRegion.set(event.region, []);
    byRegion.get(event.region).push(event);
  }

  return REGIONS.filter((region) => byRegion.has(region)).map((region) => ({
    region,
    label: REGION_LABELS[region],
    events: byRegion.get(region).sort(byCategoryThenStart),
  }));
}

function byCategoryThenStart(a, b) {
  if (a.category !== b.category) return a.category < b.category ? -1 : 1;
  return a.start - b.start;
}

/** Total events across the grouped result, for a "n events" summary. */
export function countAt(groups) {
  return groups.reduce((sum, group) => sum + group.events.length, 0);
}
