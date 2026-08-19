// Hover detail for a single event.

import { CATEGORY_LABELS, REGION_LABELS } from "../data/schema.js";
import { CATEGORY_COLORS } from "./theme.js";
import { formatEventRange } from "../timeline/render.js";

const OFFSET = 14;

export function createTooltip(root) {
  const element = document.createElement("div");
  element.className = "tooltip";
  element.hidden = true;
  root.append(element);

  return {
    show(event, position) {
      if (!event) {
        element.hidden = true;
        return;
      }
      element.style.setProperty("--event-color", CATEGORY_COLORS[event.category]);
      element.innerHTML = "";

      const title = document.createElement("strong");
      title.textContent = event.label;

      const range = document.createElement("span");
      range.className = "tooltip-range";
      range.textContent = formatEventRange(event);

      const meta = document.createElement("span");
      meta.className = "tooltip-meta";
      meta.textContent = `${CATEGORY_LABELS[event.category]} · ${REGION_LABELS[event.region]}`;

      element.append(title, range, meta);

      if (event.source) {
        const source = document.createElement("span");
        source.className = "tooltip-source";
        source.textContent = event.source;
        element.append(source);
      }

      element.hidden = false;
      // Flip before the right edge rather than after, so the tooltip never
      // pushes the page wider than the viewport.
      const width = element.offsetWidth;
      const flip = position.x + OFFSET + width > window.innerWidth;
      element.style.left = `${flip ? position.x - OFFSET - width : position.x + OFFSET}px`;
      element.style.top = `${position.y + OFFSET}px`;
    },
  };
}
