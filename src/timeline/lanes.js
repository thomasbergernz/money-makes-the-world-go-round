// Lane layout: one horizontal lane per region, each independently packed into
// tracks so that no two events in a track overlap in time.
//
// Packing uses time extents only, never pixels. That keeps the layout stable
// while the brush zooms — lanes must not reflow under the cursor, because the
// whole point of the view is that a vertical line through it means something.

import { REGIONS, REGION_LABELS, eventEnd } from "../data/schema.js";

/**
 * Greedily assign each event to the topmost track that is free at its start.
 * Mutates nothing; returns the assignment.
 *
 * @param {Array} events
 * @param {{gap?: number}} [options] minimum separation in years between
 *   consecutive events in the same track
 * @returns {{tracks: Map<string, number>, trackCount: number}}
 */
export function packTracks(events, options = {}) {
  const { gap = 0 } = options;
  const ordered = [...events].sort(compareByStartThenLongestFirst);
  const trackEnds = []; // trackEnds[i] is the last occupied year of track i
  const tracks = new Map();

  for (const event of ordered) {
    let track = trackEnds.findIndex((end) => end + gap <= event.start);
    if (track === -1) track = trackEnds.length;
    trackEnds[track] = eventEnd(event);
    tracks.set(event.id, track);
  }

  return { tracks, trackCount: trackEnds.length };
}

/**
 * Earlier events first; among simultaneous starts, longer events first so the
 * long context intervals settle into the upper tracks and short events fill in
 * beneath them.
 */
function compareByStartThenLongestFirst(a, b) {
  if (a.start !== b.start) return a.start - b.start;
  const spanA = eventEnd(a) - a.start;
  const spanB = eventEnd(b) - b.start;
  if (spanA !== spanB) return spanB - spanA;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group events into region lanes, in the fixed REGIONS order, and pack each.
 *
 * Every region gets a lane even when empty: an empty lane collapses to a thin
 * labelled strip rather than disappearing, so the lanes above and below it do
 * not jump when a filter is toggled.
 *
 * @param {Array} events already filtered
 * @param {{gap?: number}} [options]
 * @returns {Array<{region: string, label: string, events: Array, trackCount: number, tracks: Map}>}
 */
export function buildLanes(events, options = {}) {
  const byRegion = new Map(REGIONS.map((region) => [region, []]));
  for (const event of events) {
    const bucket = byRegion.get(event.region);
    if (bucket) bucket.push(event);
  }

  return REGIONS.map((region) => {
    const laneEvents = byRegion.get(region);
    const { tracks, trackCount } = packTracks(laneEvents, options);
    return {
      region,
      label: REGION_LABELS[region],
      events: laneEvents,
      tracks,
      trackCount,
    };
  });
}

/**
 * Turn packed lanes into y geometry.
 *
 * Lanes are sized in proportion to how many tracks they need, within a
 * per-track height clamp, so a busy region gets the room and a quiet one does
 * not waste it. Empty lanes get `emptyHeight`.
 *
 * @param {Array} lanes from buildLanes
 * @param {{height: number, trackHeight?: number, minTrackHeight?: number,
 *          emptyHeight?: number, laneGap?: number}} options
 * @returns {{lanes: Array, trackHeight: number, totalHeight: number}}
 */
export function layoutLanes(lanes, options) {
  const {
    height,
    trackHeight = 14,
    minTrackHeight = 4,
    emptyHeight = 14,
    laneGap = 2,
  } = options;

  const totalTracks = lanes.reduce((sum, lane) => sum + lane.trackCount, 0);
  const emptyLanes = lanes.filter((lane) => lane.trackCount === 0).length;
  const gaps = laneGap * Math.max(0, lanes.length - 1);
  const budget = height - gaps - emptyLanes * emptyHeight;

  // Shrink tracks to fit, but never below minTrackHeight; beyond that the view
  // scrolls rather than compressing events into invisibility.
  const fitted = totalTracks > 0 ? budget / totalTracks : trackHeight;
  const resolvedTrackHeight = Math.max(minTrackHeight, Math.min(trackHeight, fitted));

  let y = 0;
  const placed = lanes.map((lane) => {
    const laneHeight = lane.trackCount === 0 ? emptyHeight : lane.trackCount * resolvedTrackHeight;
    const positioned = { ...lane, y, height: laneHeight };
    y += laneHeight + laneGap;
    return positioned;
  });

  return {
    lanes: placed,
    trackHeight: resolvedTrackHeight,
    totalHeight: Math.max(0, y - laneGap),
  };
}
