// Category, region and bulk-layer chips.

import { CATEGORIES, CATEGORY_LABELS, REGIONS, REGION_LABELS } from "../data/schema.js";
import { CATEGORY_COLORS } from "./theme.js";

/**
 * @param {HTMLElement} root
 * @param {{bulkDatasets: Array, onChange: (state) => void,
 *          onBulkToggle: (id: string, on: boolean) => Promise<void>|void}} options
 * @returns {{state: {categories: Set, regions: Set}, render: () => void}}
 */
export function createFilters(root, { bulkDatasets, onChange, onBulkToggle }) {
  const state = {
    categories: new Set(CATEGORIES),
    regions: new Set(REGIONS),
    bulk: new Set(),
  };

  root.innerHTML = "";

  const categoryRow = group(root, "Domains");
  for (const category of CATEGORIES) {
    chip(categoryRow, CATEGORY_LABELS[category], CATEGORY_COLORS[category], true, (on) => {
      toggle(state.categories, category, on);
      onChange(state);
    });
  }

  const regionRow = group(root, "Regions");
  for (const region of REGIONS) {
    chip(regionRow, REGION_LABELS[region], null, true, (on) => {
      toggle(state.regions, region, on);
      onChange(state);
    });
  }

  if (bulkDatasets.length) {
    const bulkRow = group(root, "Bulk layers");
    for (const dataset of bulkDatasets) {
      chip(bulkRow, dataset.label, null, false, async (on, element) => {
        element.classList.add("is-loading");
        toggle(state.bulk, dataset.id, on);
        await onBulkToggle(dataset.id, on);
        element.classList.remove("is-loading");
      });
    }
  }

  return { state };
}

function toggle(set, value, on) {
  if (on) set.add(value);
  else set.delete(value);
}

function group(root, title) {
  const wrapper = document.createElement("div");
  wrapper.className = "filter-group";
  const heading = document.createElement("span");
  heading.className = "filter-heading";
  heading.textContent = title;
  wrapper.append(heading);
  root.append(wrapper);
  return wrapper;
}

function chip(parent, label, color, initiallyOn, onToggle) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.setAttribute("aria-pressed", String(initiallyOn));
  button.classList.toggle("is-on", initiallyOn);
  if (color) button.style.setProperty("--chip-color", color);

  const swatch = document.createElement("span");
  swatch.className = "chip-swatch";
  button.append(swatch, document.createTextNode(label));

  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("is-on", on);
    onToggle(on, button);
  });

  parent.append(button);
  return button;
}

/** Apply the chip state to the corpus. */
export function applyFilters(events, state) {
  return events.filter(
    (event) => state.categories.has(event.category) && state.regions.has(event.region),
  );
}
