// The timeline: region lanes on a shared year axis, a navigation band with a
// brush, and a cursor that reports what overlaps a single moment.

import { pointer, select } from "d3-selection";
import { extent } from "d3-array";
import { createChart } from "./bands.js";
import { buildLanes, layoutLanes, packTracks } from "./lanes.js";
import { renderItems } from "./render.js";
import { attachBrush } from "./brush.js";
import { eventsAt } from "./cursor.js";
import { eventEnd } from "../data/schema.js";
import { formatYear } from "../time/year.js";

const CURSOR_HIT_RADIUS_PX = 4;

/** True when two year ranges are the same to within a rounding error. */
function sameRange([a, b], [c, d]) {
  return Math.abs(a - c) < 1e-6 && Math.abs(b - d) < 1e-6;
}

/** Keep a range inside an extent, collapsing to the extent if it no longer fits. */
function clamp([lo, hi], [min, max]) {
  const start = Math.max(lo, min);
  const end = Math.min(hi, max);
  return end > start ? [start, end] : [min, max];
}

/**
 * @param {HTMLElement} container
 * @param {{height?: number, onCursor?: (info: {year: number, groups: Array}|null) => void,
 *          onHover?: (event: object|null, position: {x: number, y: number}) => void}} [options]
 */
export function createTimeline(container, options = {}) {
  const { onCursor = () => {}, onHover = () => {} } = options;

  const chart = createChart(container, options);

  let visible = [];
  let windowed = [];
  let lanes = [];
  let trackHeight = 12;
  let brushControl = null;

  chart.resize();

  // --- lanes ---------------------------------------------------------------

  /**
   * Lanes are packed against the events in the current time window, not the
   * whole corpus. Zooming into a quiet century therefore gives its events room
   * to carry labels, instead of squeezing them into tracks sized for the
   * busiest period on the axis.
   */
  function rebuildLanes() {
    const [lo, hi] = chart.mainScale.domain();
    windowed = visible.filter((event) => event.start <= hi && eventEnd(event) >= lo);
    const packed = buildLanes(windowed);
    const laid = layoutLanes(packed, { height: chart.mainHeight });
    lanes = laid.lanes;
    trackHeight = laid.trackHeight;
    renderLaneScaffolding();
  }

  function renderLaneScaffolding() {
    chart.mainBand
      .selectAll("g.lane")
      .data(lanes, (lane) => lane.region)
      .join((enter) => {
        const lane = enter.append("g").attr("class", "lane");
        lane.append("rect").attr("class", "lane-bg");
        lane.append("g").attr("class", "lane-items");
        return lane;
      })
      .attr("transform", (lane) => `translate(0,${lane.y})`)
      .classed("is-empty", (lane) => lane.trackCount === 0)
      .select("rect.lane-bg")
      .attr("width", chart.plotWidth)
      .attr("height", (lane) => lane.height);

    chart.gutter
      .selectAll("g.lane-label")
      .data(lanes, (lane) => lane.region)
      .join((enter) => {
        const label = enter.append("g").attr("class", "lane-label");
        label.append("text").attr("class", "lane-name").attr("x", 8);
        label.append("text").attr("class", "lane-count").attr("x", 8);
        return label;
      })
      .attr("transform", (lane) => `translate(0,${lane.y})`)
      .classed("is-empty", (lane) => lane.trackCount === 0)
      .call((selection) => {
        selection.select("text.lane-name").attr("y", 10).text((lane) => lane.label);
        selection
          .select("text.lane-count")
          .attr("y", 22)
          .attr("display", (lane) => (lane.height > 26 && lane.events.length ? null : "none"))
          .text((lane) => `${lane.events.length}`);
      });
  }

  // --- drawing -------------------------------------------------------------

  chart.onRedraw(() => {
    chart.mainBand.selectAll("g.lane").each(function (lane) {
      renderItems(
        select(this).select("g.lane-items"),
        lane.events,
        lane.tracks,
        chart.mainScale,
        trackHeight,
      );
    });
  });

  function renderNavi() {
    // The overview ignores regions: it is a density picture of the whole
    // corpus, so the brush shows you where the data is before you zoom in.
    const { tracks, trackCount } = packTracks(visible);
    const naviTrackHeight = trackCount ? Math.max(1, Math.min(4, chart.naviHeight / trackCount)) : 1;
    renderItems(chart.naviItems, visible, tracks, chart.naviScale, naviTrackHeight, {
      labels: false,
    });
  }

  // --- cursor --------------------------------------------------------------

  const cursorLine = chart.cursorLayer.append("line").attr("class", "cursor-line").attr("y1", 0);
  const cursorLabel = chart.cursorLayer.append("text").attr("class", "cursor-label");

  /**
   * The event under a point, found geometrically rather than by hit-testing the
   * DOM. The cursor overlay has to sit above the items to keep receiving
   * mousemove everywhere, which means the items themselves never see the
   * pointer — so the lane and track are derived from the y coordinate instead.
   */
  function eventUnder(px, py, year, tolerance) {
    const lane = lanes.find((entry) => py >= entry.y && py < entry.y + entry.height);
    if (!lane || lane.trackCount === 0) return null;
    const track = Math.floor((py - lane.y) / trackHeight);
    return (
      lane.events.find((event) => {
        if (lane.tracks.get(event.id) !== track) return false;
        return event.instant
          ? Math.abs(event.start - year) <= tolerance
          : event.start <= year && year <= eventEnd(event);
      }) ?? null
    );
  }

  function moveCursor(px, py, clientX, clientY) {
    const year = chart.mainScale.invert(px);
    const tolerance = Math.abs(
      chart.mainScale.invert(CURSOR_HIT_RADIUS_PX) - chart.mainScale.invert(0),
    );
    cursorLine.attr("x1", px).attr("x2", px).attr("y2", chart.mainHeight).style("display", null);
    cursorLabel
      .attr("x", px + 4)
      .attr("y", 11)
      .attr("text-anchor", px > chart.plotWidth - 60 ? "end" : "start")
      .text(formatYear(year))
      .style("display", null);
    onCursor({ year, groups: eventsAt(windowed, year, { tolerance }) });
    onHover(eventUnder(px, py, year, tolerance), { x: clientX, y: clientY });
  }

  function hideCursor() {
    cursorLine.style("display", "none");
    cursorLabel.style("display", "none");
    onCursor(null);
    onHover(null, { x: 0, y: 0 });
  }

  chart.overlay
    .on("mousemove", (event) => {
      const [px, py] = pointer(event, chart.overlay.node());
      moveCursor(px, py, event.clientX, event.clientY);
    })
    .on("mouseleave", hideCursor);

  // --- brush ---------------------------------------------------------------

  function attach() {
    brushControl = attachBrush(chart.brushGroup, {
      width: chart.plotWidth,
      height: chart.naviHeight,
      x: (year) => chart.naviScale(year),
      invert: (px) => chart.naviScale.invert(px),
      onDomain(domain, isFinal) {
        chart.mainScale.domain(domain ?? chart.naviScale.domain());
        if (isFinal) rebuildLanes();
        chart.redraw();
      },
    });
  }

  // --- public API ----------------------------------------------------------

  return {
    /** Set the full corpus. Fixes the overall extent that the navi band shows. */
    setData(events) {
      const [lo, hi] = extent(events.flatMap((event) => [event.start, eventEnd(event)]));
      const pad = Math.max(10, (hi - lo) * 0.01);
      const full = [lo - pad, hi + pad];

      // Switching a bulk layer on must not throw away the reader's zoom. Keep
      // whatever range is in view, clamped into the new extent, and move the
      // brush to match — a selection rect that disagrees with the detail band
      // is worse than no selection at all.
      //
      // "Was the reader zoomed in?" has to be asked against the *old* extent.
      // A bulk layer usually widens the extent, so comparing the old view to
      // the new full range would read an unzoomed view as a selection and
      // paint a brush across nearly the whole band.
      const wasZoomed =
        brushControl != null && !sameRange(chart.mainScale.domain(), chart.naviScale.domain());
      const current = wasZoomed ? clamp(chart.mainScale.domain(), full) : null;

      chart.naviScale.domain(full);
      chart.mainScale.domain(current ?? full);
      if (!brushControl) attach();
      else brushControl.setDomain(current);
    },

    /** Set the filtered subset that is actually drawn. */
    setVisible(events) {
      visible = events;
      rebuildLanes();
      renderNavi();
      chart.redraw();
      hideCursor();
    },

    /** Zoom the detail band; null restores the full range. */
    setDomain(domain) {
      chart.mainScale.domain(domain ?? chart.naviScale.domain());
      brushControl?.setDomain(domain);
      rebuildLanes();
      chart.redraw();
    },

    resize() {
      // d3-brush stores its selection in pixels. Re-attaching against a new
      // width leaves that rect denoting a different year range than the detail
      // band is showing, so the domain is captured and repainted afterwards.
      const domain = chart.mainScale.domain();
      const full = chart.naviScale.domain();

      chart.resize();
      attach();
      chart.mainScale.domain(domain);
      brushControl.setDomain(sameRange(domain, full) ? null : domain);

      rebuildLanes();
      renderNavi();
      chart.redraw();
    },
  };
}
