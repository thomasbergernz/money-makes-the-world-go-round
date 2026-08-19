// Chart shell: the two bands, the axis, the lane gutter, and the single redraw
// registry that keeps everything on the same scale.
//
// The original had two registries — one for the initial paint, one for the
// brush — and a component registered in only one of them would render once and
// then silently stop tracking the brush. There is exactly one here.

import { select } from "d3-selection";
import { scaleLinear } from "d3-scale";
import { yearTicks, tickLabel } from "./axis.js";

export const GUTTER = 104;

/**
 * @param {HTMLElement} container
 * @param {{height?: number, naviHeight?: number, axisHeight?: number}} [options]
 */
export function createChart(container, options = {}) {
  const { height = 560, naviHeight = 66, axisHeight = 22 } = options;

  const redraws = [];
  let width = 0;
  let plotWidth = 0;

  const svg = select(container).append("svg").attr("class", "timeline-svg");

  const defs = svg.append("defs");
  const clipId = `plot-clip-${Math.random().toString(36).slice(2, 8)}`;
  const clipRect = defs.append("clipPath").attr("id", clipId).append("rect").attr("x", 0).attr("y", 0);

  const mainHeight = height - naviHeight - axisHeight * 2 - 18;

  // Scales. The main scale is what the brush rewrites; the navi scale is fixed
  // to the full extent, which is what makes the overview an overview.
  const mainScale = scaleLinear();
  const naviScale = scaleLinear();

  const gutter = svg.append("g").attr("class", "gutter").attr("transform", `translate(0,0)`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${GUTTER},0)`);

  const mainClip = plot.append("g").attr("clip-path", `url(#${clipId})`);
  const mainBand = mainClip.append("g").attr("class", "main-band");
  const overlay = plot
    .append("rect")
    .attr("class", "cursor-overlay")
    .attr("y", 0)
    .attr("height", mainHeight);
  const mainAxis = plot.append("g").attr("class", "axis main-axis").attr("transform", `translate(0,${mainHeight})`);
  const cursorLayer = plot.append("g").attr("class", "cursor-layer");

  const naviTop = mainHeight + axisHeight + 18;
  const naviBand = plot.append("g").attr("class", "navi-band").attr("transform", `translate(0,${naviTop})`);
  const naviAxis = plot
    .append("g")
    .attr("class", "axis navi-axis")
    .attr("transform", `translate(0,${naviTop + naviHeight})`);

  naviBand.append("rect").attr("class", "navi-bg").attr("height", naviHeight);
  const naviItems = naviBand.append("g").attr("class", "navi-items");
  const brushGroup = naviBand.append("g").attr("class", "navi-brush");

  function resize() {
    width = container.clientWidth || 960;
    plotWidth = Math.max(120, width - GUTTER - 12);
    svg.attr("width", width).attr("height", height);
    clipRect.attr("width", plotWidth).attr("height", mainHeight);
    overlay.attr("width", plotWidth);
    naviBand.select("rect.navi-bg").attr("width", plotWidth);
    mainScale.range([0, plotWidth]);
    naviScale.range([0, plotWidth]);
  }

  function renderAxis(group, scale) {
    const ticks = yearTicks(scale.domain(), Math.max(4, Math.round(plotWidth / 110)));
    group
      .selectAll("g.tick")
      .data(ticks, (d) => d)
      .join((enter) => {
        const tick = enter.append("g").attr("class", "tick");
        tick.append("line").attr("y2", 5);
        tick.append("text").attr("y", 16).attr("text-anchor", "middle");
        return tick;
      })
      .attr("transform", (d) => `translate(${scale(d)},0)`)
      .classed("era-boundary", (d) => d === 1)
      .select("text")
      .text(tickLabel);
  }

  return {
    svg,
    plot,
    gutter,
    mainBand,
    mainAxis,
    naviBand,
    naviItems,
    naviAxis,
    brushGroup,
    overlay,
    cursorLayer,
    mainScale,
    naviScale,
    get width() {
      return width;
    },
    get plotWidth() {
      return plotWidth;
    },
    mainHeight,
    naviHeight,
    naviTop,

    /** Register a function to run on every redraw. There is only one list. */
    onRedraw(fn) {
      redraws.push(fn);
    },

    renderAxis,

    resize() {
      resize();
    },

    redraw() {
      renderAxis(mainAxis, mainScale);
      renderAxis(naviAxis, naviScale);
      for (const fn of redraws) fn();
    },
  };
}
