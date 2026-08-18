// The cursor panel: everything overlapping one moment, across every lane.

import { CATEGORY_LABELS } from "../data/schema.js";
import { CATEGORY_COLORS } from "./theme.js";
import { formatYear } from "../time/year.js";
import { formatEventRange } from "../timeline/render.js";
import { countAt } from "../timeline/cursor.js";

export function createPanel(root) {
  root.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-year">—</h2>
      <p class="panel-count">Move the pointer across the timeline</p>
    </div>
    <div class="panel-body"></div>`;

  const yearEl = root.querySelector(".panel-year");
  const countEl = root.querySelector(".panel-count");
  const bodyEl = root.querySelector(".panel-body");

  return {
    update(info) {
      if (!info) {
        yearEl.textContent = "—";
        countEl.textContent = "Move the pointer across the timeline";
        bodyEl.innerHTML = "";
        return;
      }

      const total = countAt(info.groups);
      yearEl.textContent = formatYear(info.year);
      countEl.textContent =
        total === 0
          ? "Nothing recorded here"
          : `${total} event${total === 1 ? "" : "s"} across ${info.groups.length} region${
              info.groups.length === 1 ? "" : "s"
            }`;

      bodyEl.replaceChildren(
        ...info.groups.map((group) => {
          const section = document.createElement("section");
          section.className = "panel-region";

          const heading = document.createElement("h3");
          heading.textContent = group.label;
          section.append(heading);

          const list = document.createElement("ul");
          for (const event of group.events) {
            const item = document.createElement("li");
            item.style.setProperty("--event-color", CATEGORY_COLORS[event.category]);
            item.title = CATEGORY_LABELS[event.category];

            const label = document.createElement("span");
            label.className = "event-label";
            label.textContent = event.label;

            const range = document.createElement("span");
            range.className = "event-range";
            range.textContent = formatEventRange(event);

            item.append(label, range);
            list.append(item);
          }
          section.append(list);
          return section;
        }),
      );
    },
  };
}
