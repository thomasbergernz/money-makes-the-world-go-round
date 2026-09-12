// The cursor panel: everything overlapping one moment, across every lane.

import { CATEGORY_LABELS } from "../data/schema.js";
import { CATEGORY_COLORS } from "./theme.js";
import { formatYear } from "../time/year.js";
import { formatEventRange } from "../timeline/render.js";
import { countAt } from "../timeline/cursor.js";
import { buildLinkIndex } from "../data/links.js";

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

  // Links resolve against the whole corpus, not just the events under the
  // cursor — the event a chain points at is usually the one just outside the
  // moment being inspected.
  let links = buildLinkIndex([]);

  return {
    setEvents(events) {
      links = buildLinkIndex(events);
    },
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

            // One line per direct neighbour, walked to the end of its branch
            // (first parent per hop) so Drais reads back to Tambora, not just
            // to the fodder crisis.
            for (const target of links.follows(event.id)) {
              item.append(linkLine("follows", branch(target, links.follows, event.id), " ← "));
            }
            for (const target of links.followedBy(event.id)) {
              item.append(linkLine("followed by", branch(target, links.followedBy, event.id), " → "));
            }

            list.append(item);
          }
          section.append(list);
          return section;
        }),
      );
    },
  };
}

const HOP_MAX_CHARS = 40;

/** The labels along one branch, first parent per hop, cycle-guarded. */
function branch(first, step, originId) {
  const seen = new Set([originId, first.id]);
  const labels = [hopLabel(first.label)];
  let current = first;
  for (;;) {
    const next = step(current.id)[0];
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    labels.push(hopLabel(next.label));
    current = next;
  }
  return labels;
}

function hopLabel(label) {
  if (label.length <= HOP_MAX_CHARS) return label;
  return `${label.slice(0, HOP_MAX_CHARS - 1)}…`;
}

function linkLine(relation, labels, joiner) {
  const line = document.createElement("span");
  line.className = "event-link-line";
  line.textContent = `${relation === "follows" ? "↑" : "↓"} ${relation} ${labels.join(joiner)}`;
  return line;
}
