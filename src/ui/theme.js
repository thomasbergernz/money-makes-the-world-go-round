// Shared visual vocabulary. One colour per category, used identically in the
// lanes, the navigation band, the filter chips and the cursor panel — the
// colour is how you track a domain across lanes, so it must never drift.

export const CATEGORY_COLORS = Object.freeze({
  nature: "#2e8b6f",
  economy: "#c9992b",
  politics: "#b4553f",
  science: "#4a72b8",
  thought: "#8262a8",
});

export const CATEGORY_COLORS_DIM = Object.freeze({
  nature: "#8fc4b4",
  economy: "#e0cb90",
  politics: "#d8a597",
  science: "#a3b8dc",
  thought: "#c0b0d4",
});

export function categoryColor(category) {
  return CATEGORY_COLORS[category] ?? "#888888";
}
