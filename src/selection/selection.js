// A selection is what the reader has actually chosen to look at: a time range
// from the brush, a set of domains and regions from the chips, and the events
// that survive both.
//
// It is derived, never stored. Every ingredient already has one owner — the
// scale owns the range, the chips own the filters, the timeline owns the
// windowed event list — and mirroring them into a fourth object is how the
// navigation band and the detail band came to disagree twice already.

import { REGIONS, REGION_LABELS, CATEGORIES, CATEGORY_LABELS } from "../data/schema.js";

/**
 * @param {{from: number, to: number, events: Array}} window from the timeline
 * @param {{categories: Set<string>, regions: Set<string>}} filters from the chips
 */
export function buildSelection(window, filters) {
  return {
    from: window.from,
    to: window.to,
    events: window.events,
    // Ordered by the enums rather than by Set insertion, so the same selection
    // always serialises identically.
    categories: CATEGORIES.filter((category) => filters.categories.has(category)),
    regions: REGIONS.filter((region) => filters.regions.has(region)),
  };
}

/** Events grouped by region, in lane order, skipping regions with nothing in them. */
export function groupByRegion(selection) {
  const byRegion = new Map();
  for (const event of selection.events) {
    if (!byRegion.has(event.region)) byRegion.set(event.region, []);
    byRegion.get(event.region).push(event);
  }
  return REGIONS.filter((region) => byRegion.has(region)).map((region) => ({
    region,
    label: REGION_LABELS[region],
    events: byRegion.get(region).sort((a, b) => a.start - b.start),
  }));
}

/** Counts per category, in enum order, for the chip and the digest header. */
export function countByCategory(selection) {
  return CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    count: selection.events.filter((event) => event.category === category).length,
  })).filter((entry) => entry.count > 0);
}

/** True when the reader has not narrowed anything — every chip still on. */
export function isUnfiltered(selection) {
  return (
    selection.categories.length === CATEGORIES.length &&
    selection.regions.length === REGIONS.length
  );
}
