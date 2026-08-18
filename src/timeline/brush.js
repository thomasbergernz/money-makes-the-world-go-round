// Navigation brush: drag on the overview band to set the detail band's range.

import { brushX } from "d3-brush";

/**
 * @param {import("d3-selection").Selection} group where the brush lives
 * @param {{width: number, height: number, x: (year: number) => number,
 *          invert: (px: number) => number, onDomain: (domain: [number, number]|null) => void}} options
 * @returns {{setDomain: (domain: [number, number]|null) => void, resize: () => void}}
 */
export function attachBrush(group, { width, height, x, invert, onDomain }) {
  let suppress = false;

  const brush = brushX()
    .extent([
      [0, 0],
      [width, height],
    ])
    .on("brush end", (event) => {
      if (suppress) return;
      // An empty selection is a click outside the brush: restore the full range.
      // `end` means the drag is over, which is when it is safe to reflow lane
      // heights — doing that mid-drag would make the lanes jump under the
      // pointer that is driving them.
      onDomain(event.selection ? event.selection.map(invert) : null, event.type === "end");
    });

  group.call(brush);

  return {
    /** Move the brush without re-firing the handler that moved it. */
    setDomain(domain) {
      suppress = true;
      group.call(brush.move, domain ? domain.map(x) : null);
      suppress = false;
    },
  };
}
