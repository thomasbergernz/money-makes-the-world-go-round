// Item rendering for one lane.
//
// Intervals are rects, instants are dots. Neither borrows width from the
// other: an instant is drawn at a fixed pixel radius around its year, which is
// why it can stay visible at any zoom without the data pretending it lasted a
// century.

import { categoryColor } from "../ui/theme.js";
import { formatYear } from "../time/year.js";
import { eventEnd } from "../data/schema.js";

export const INSTANT_RADIUS = 3.5;
const MIN_INTERVAL_WIDTH = 2;
const LABEL_MIN_WIDTH = 34;
const CHAR_WIDTH = 5.6;

/** True when the date is known loosely enough that it should not read as crisp. */
export function isUncertain(event) {
  return event.certainty === "approx" || event.certainty === "contested";
}

/** Display label for an event's dates, with a "c." prefix when uncertain. */
export function formatEventRange(event) {
  const circa = isUncertain(event);
  const start = formatYear(event.start, { circa });
  if (event.instant) return start;
  return `${start} – ${formatYear(eventEnd(event))}`;
}

/**
 * Horizontal room available to each event's label: from where the label starts
 * to where the next event in the same track begins.
 */
function measureLabelRoom(events, tracks, x) {
  const byTrack = new Map();
  for (const event of events) {
    const track = tracks.get(event.id);
    if (!byTrack.has(track)) byTrack.set(track, []);
    byTrack.get(track).push(event);
  }

  const room = new Map();
  const [, rangeEnd] = x.range();
  for (const inTrack of byTrack.values()) {
    inTrack.sort((a, b) => a.start - b.start);
    inTrack.forEach((event, i) => {
      const labelStart =
        x(event.start) + (event.instant ? INSTANT_RADIUS + 3 : 3);
      const next = inTrack[i + 1];
      const limit = next ? x(next.start) - 3 : rangeEnd;
      room.set(event.id, limit - labelStart);
    });
  }
  return room;
}

function truncate(text, maxChars) {
  if (maxChars < 3 || text.length <= maxChars) return text.slice(0, Math.max(0, maxChars));
  return `${text.slice(0, maxChars - 1)}…`;
}

/**
 * Join events into a lane group and position them.
 *
 * @param {import("d3-selection").Selection} group the lane's items <g>
 * @param {Array} events
 * @param {Map<string, number>} tracks event id -> track index
 * @param {(year: number) => number} x scale
 * @param {number} trackHeight
 * @param {{labels?: boolean}} [options] navigation band renders without labels
 */
export function renderItems(group, events, tracks, x, trackHeight, options = {}) {
  const { labels = true } = options;
  const itemHeight = Math.max(2, trackHeight - 2);
  const room = labels ? measureLabelRoom(events, tracks, x) : null;

  const items = group
    .selectAll("g.item")
    .data(events, (event) => event.id)
    .join((enter) => {
      const entered = enter.append("g").attr("class", "item");
      entered.append("rect").attr("class", "uncertainty");
      entered.append("rect").attr("class", "body");
      entered.append("circle").attr("class", "dot");
      if (labels) entered.append("text").attr("class", "item-label");
      return entered;
    });

  items
    .attr("data-category", (event) => event.category)
    .attr("data-id", (event) => event.id)
    .classed("is-instant", (event) => event.instant)
    .classed("is-uncertain", isUncertain)
    .attr("transform", (event) => `translate(0,${tracks.get(event.id) * trackHeight})`);

  // The uncertainty halo: the range the date could actually be in. Drawn only
  // when the data states a number, never guessed from the certainty label.
  items
    .select("rect.uncertainty")
    .attr("display", (event) => (event.uncertainty > 0 ? null : "none"))
    .attr("x", (event) => x(event.start - event.uncertainty))
    .attr("width", (event) =>
      Math.max(1, x(eventEnd(event) + event.uncertainty) - x(event.start - event.uncertainty)),
    )
    .attr("y", 0)
    .attr("height", itemHeight)
    .attr("fill", (event) => categoryColor(event.category));

  items
    .select("rect.body")
    .attr("display", (event) => (event.instant ? "none" : null))
    .attr("x", (event) => x(event.start))
    .attr("width", (event) => Math.max(MIN_INTERVAL_WIDTH, x(eventEnd(event)) - x(event.start)))
    .attr("y", 0)
    .attr("height", itemHeight)
    .attr("fill", (event) => categoryColor(event.category));

  items
    .select("circle.dot")
    .attr("display", (event) => (event.instant ? null : "none"))
    .attr("cx", (event) => x(event.start))
    .attr("cy", itemHeight / 2)
    .attr("r", Math.min(INSTANT_RADIUS, itemHeight / 2))
    .attr("fill", (event) => categoryColor(event.category));

  if (labels) {
    items
      .select("text.item-label")
      .attr("y", itemHeight - Math.max(1, (itemHeight - 7) / 2))
      .attr("x", (event) =>
        event.instant ? x(event.start) + INSTANT_RADIUS + 3 : x(event.start) + 3,
      )
      .text((event) => {
        // A label may use its own bar plus whatever empty space follows it in
        // the same track, but never more: a label that ran under the next
        // event would claim time this event does not occupy.
        const available = room.get(event.id);
        if (available < LABEL_MIN_WIDTH) return "";
        return truncate(event.label, Math.floor(available / CHAR_WIDTH));
      })
      .attr("display", itemHeight < 8 ? "none" : null);
  }

  return items;
}
