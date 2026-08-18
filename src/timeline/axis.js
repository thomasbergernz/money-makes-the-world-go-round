// Year axis ticks and labels.
//
// d3's linear ticks land on round *astronomical* years, which read as ugly
// historical ones: astronomical -2500 is "2501 BC". These ticks land on round
// historical years on both sides of the era boundary, and include year 1
// itself when it is in view.

import { tickStep } from "d3-array";
import { formatYear } from "../time/year.js";

/**
 * @param {[number, number]} domain decimal astronomical years
 * @param {number} [count] approximate number of ticks wanted
 * @returns {number[]} tick positions in astronomical years, ascending
 */
export function yearTicks([lo, hi], count = 10) {
  if (!(hi > lo)) return [];
  const step = Math.max(1, Math.round(tickStep(lo, hi, count)));
  const ticks = new Set();

  // AD side: round historical years are round astronomical years.
  for (let y = Math.ceil(Math.max(lo, 1) / step) * step; y <= hi; y += step) ticks.add(y);

  // BC side: historical year h sits at astronomical year 1 - h.
  for (let h = step; 1 - h >= lo; h += step) {
    const y = 1 - h;
    if (y <= hi) ticks.add(y);
  }

  // The era boundary is the most informative tick on the whole axis.
  if (lo <= 1 && hi >= 1) ticks.add(1);

  return [...ticks].sort((a, b) => a - b);
}

/** Tick label: "500 BC", "1", "1500". */
export function tickLabel(year) {
  return formatYear(year);
}
