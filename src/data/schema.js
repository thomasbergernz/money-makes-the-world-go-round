// The event schema shared by every dataset, curated or ingested.
//
// Validation is strict and fails loudly. A misspelt region silently becoming
// its own lane, or a missing end date silently becoming a century-long
// interval, are the two failure modes that would quietly invalidate every
// correlation the timeline claims to show.

import { parseYear, parseYearSpan } from "../time/year.js";

/** Lane keys. GLOBAL is a real lane, rendered first, not a null value. */
export const REGIONS = Object.freeze([
  "GLOBAL",
  "EUROPE",
  "MIDDLE_EAST",
  "AFRICA",
  "ASIA_EAST",
  "ASIA_SOUTH",
  "AMERICAS",
  "OCEANIA",
]);

export const REGION_LABELS = Object.freeze({
  GLOBAL: "Global",
  EUROPE: "Europe",
  MIDDLE_EAST: "Middle East",
  AFRICA: "Africa",
  ASIA_EAST: "East Asia",
  ASIA_SOUTH: "South Asia",
  AMERICAS: "Americas",
  OCEANIA: "Oceania",
});

export const CATEGORIES = Object.freeze([
  "nature",
  "economy",
  "politics",
  "science",
  "thought",
]);

export const CATEGORY_LABELS = Object.freeze({
  nature: "Nature & climate",
  economy: "Economy & money",
  politics: "Politics & conflict",
  science: "Science & disease",
  thought: "Thought & culture",
});

/** How well the date is known. Drives edge rendering and the "c." prefix. */
export const CERTAINTIES = Object.freeze(["exact", "year", "approx", "contested"]);

export const REQUIRED_COLUMNS = Object.freeze([
  "id",
  "start",
  "label",
  "category",
  "region",
  "certainty",
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

class SchemaError extends Error {
  constructor(message, context) {
    super(context ? `${message} (${context})` : message);
    this.name = "SchemaError";
  }
}

/**
 * Normalise one raw CSV row into an event.
 *
 * @param {Record<string, string>} row
 * @param {{dataset?: string, index?: number}} [where] for error messages
 * @returns {{
 *   id: string, label: string, category: string, region: string,
 *   certainty: string, uncertainty: number, source: string, link: string,
 *   start: number, end: number|null, instant: boolean, dataset: string,
 * }}
 */
export function normaliseRow(row, where = {}) {
  const context = [where.dataset, where.index != null ? `row ${where.index + 2}` : null]
    .filter(Boolean)
    .join(" ");

  const at = (message) => new SchemaError(message, context);
  const text = (field) => (row[field] ?? "").trim();

  for (const column of REQUIRED_COLUMNS) {
    if (text(column) === "") throw at(`Missing required field "${column}"`);
  }

  const id = text("id");
  if (!ID_PATTERN.test(id)) {
    throw at(`Invalid id "${id}": use lowercase letters, digits and hyphens`);
  }

  const category = text("category");
  if (!CATEGORIES.includes(category)) {
    throw at(`Unknown category "${category}": expected one of ${CATEGORIES.join(", ")}`);
  }

  const region = text("region");
  if (!REGIONS.includes(region)) {
    throw at(`Unknown region "${region}": expected one of ${REGIONS.join(", ")}`);
  }

  const certainty = text("certainty");
  if (!CERTAINTIES.includes(certainty)) {
    throw at(`Unknown certainty "${certainty}": expected one of ${CERTAINTIES.join(", ")}`);
  }

  // An interval runs from the beginning of its start's span to the end of its
  // end's span, so "1939,1945" covers all of both years. A lone instant is a
  // point, and sits at the middle of the span it was written at.
  let startSpan;
  try {
    startSpan = parseYearSpan(text("start"));
  } catch (cause) {
    throw at(`Bad start date: ${cause.message}`);
  }

  // An empty end means an instant, and it stays empty. The original viewer
  // substituted start + 100 years so instants had drawable width; that phantom
  // century wrecks lane packing and makes the time cursor report overlaps that
  // never happened. Instants get their width in pixels at render time instead.
  const endText = text("end");
  let end = null;
  if (endText !== "") {
    try {
      end = parseYearSpan(endText)[1];
    } catch (cause) {
      throw at(`Bad end date: ${cause.message}`);
    }
    if (end < startSpan[0]) throw at(`End ${endText} precedes start ${text("start")}`);
  }

  const start = end === null ? parseYear(text("start")) : startSpan[0];

  const uncertaintyText = text("uncertainty");
  let uncertainty = 0;
  if (uncertaintyText !== "") {
    uncertainty = Number(uncertaintyText);
    if (!Number.isFinite(uncertainty) || uncertainty < 0) {
      throw at(`Uncertainty must be a non-negative number of years, got "${uncertaintyText}"`);
    }
  }

  return {
    id,
    label: text("label"),
    category,
    region,
    certainty,
    uncertainty,
    source: text("source"),
    link: text("link"),
    start,
    end,
    instant: end === null,
    dataset: where.dataset ?? "",
  };
}

/**
 * Normalise a whole dataset, collecting every problem before throwing so a
 * bad CSV reports all of its errors in one pass rather than one per run.
 *
 * @returns {{events: Array, errors: string[]}}
 */
export function normaliseDataset(rows, dataset) {
  const events = [];
  const errors = [];
  rows.forEach((row, index) => {
    try {
      events.push(normaliseRow(row, { dataset, index }));
    } catch (error) {
      errors.push(error.message);
    }
  });
  return { events, errors };
}

/** First-wins de-duplication by id, so a bulk layer never doubles a curated event. */
export function dedupeById(events) {
  const seen = new Map();
  for (const event of events) {
    if (!seen.has(event.id)) seen.set(event.id, event);
  }
  return [...seen.values()];
}

/** The instant of an event used for overlap tests: its end, or its start. */
export function eventEnd(event) {
  return event.end ?? event.start;
}
