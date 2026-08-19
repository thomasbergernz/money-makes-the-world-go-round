// Turns a selection into a prompt.
//
// The hard requirement is honesty about size. A digest that quietly omits two
// hundred events reads to a model as a complete window, and it will reason
// confidently over a gap it cannot see — the same failure mode as the
// hundred-year phantom durations this project already removed once. So the cap
// degrades in named steps, and every step states what it gave up.

import { formatYear } from "../time/year.js";
import { REGION_LABELS, CATEGORY_LABELS, eventEnd } from "../data/schema.js";
import { formatEventRange, isUncertain } from "../timeline/render.js";
import { groupByRegion, countByCategory, isUnfiltered } from "./selection.js";

/** Roughly the characters a comfortable prompt should not exceed. */
export const DEFAULT_MAX_CHARS = 60000;

/** How many degradation steps exist, least to most lossy. */
export const RUNG_COUNT = 4;

/** At the last rung, how many events per region survive. */
const SUMMARY_KEEP = 8;

export const PURPOSES = {
  explain: {
    label: "Explain the correlations",
    instruction: `Look at the events below, which are drawn from one window of a historical timeline and grouped by world region.

Identify the connections that plausibly exist between them — causal, contributing, or shared-cause. Say plainly which links are well established, which are contested among historians, and which are merely coincident in time. Where events in different regions share a cause, say so.

Be specific about mechanism. "The eruption cooled the climate, which failed the harvest, which raised grain prices" is useful; "these events are related" is not.`,
  },
  question: {
    label: "Answer a question",
    instruction: `The events below are drawn from one window of a historical timeline, grouped by world region. Use them as the grounding for the question that follows. Draw on your own knowledge too, but say clearly when you are going beyond what the selection contains.`,
  },
  gaps: {
    label: "Find what is missing",
    instruction: `The events below are one window of a curated historical timeline, grouped by world region.

Identify what is missing — events significant enough to belong here that the selection does not contain, especially ones that would explain or be explained by something already present. Prefer events that participate in a correlation you can name over ones that merely add coverage. Call out regions that look under-represented for the period.

Return your suggestions as CSV rows in exactly this schema, ready to paste into the dataset:

id,start,end,label,category,region,certainty,uncertainty,source,link

Rules for those rows: id is a lowercase hyphenated slug, unique. start and end accept "1815", "1815 BC", "1815-04" or "1815-04-10"; a bare negative year is rejected, so spell out the era. An empty end means the event is an instant. certainty is exact, year, approx or contested; contested requires a non-zero uncertainty in years. Use only the category and region values listed above.`,
  },
  narrative: {
    label: "Draft a narrative",
    instruction: `The events below are one window of a historical timeline, grouped by world region.

Write readable prose that makes sense of this window as a whole — what was happening, how the regions related to one another, and what a reader should take away. Follow the threads that cross regions rather than working through one lane at a time. Where the connection between events is contested, say so rather than smoothing it over.`,
  },
};

/**
 * Assemble the full prompt for a selection.
 *
 * @param {object} selection from buildSelection
 * @param {{purpose?: string, question?: string, maxChars?: number}} [options]
 * @returns {{text: string, rung: number, dropped: string[], estimatedTokens: number,
 *            eventCount: number, includedCount: number}}
 */
export function buildPrompt(selection, options = {}) {
  const {
    purpose = "explain",
    question = "",
    maxChars = DEFAULT_MAX_CHARS,
    rung: forcedRung,
  } = options;
  const preset = PURPOSES[purpose] ?? PURPOSES.explain;

  if (forcedRung != null) {
    const forced = render(selection, preset, question, forcedRung);
    return { ...forced, estimatedTokens: estimateTokens(forced.text), eventCount: selection.events.length };
  }

  // Try each rung in turn and keep the first that fits. The last rung is used
  // whether or not it fits — there is nothing smaller to fall back to, and
  // truncating mid-list would be the silent failure this is built to avoid.
  let result;
  for (let rung = 0; rung < RUNGS.length; rung++) {
    result = render(selection, preset, question, rung);
    if (result.text.length <= maxChars) break;
  }

  return {
    ...result,
    estimatedTokens: estimateTokens(result.text),
    eventCount: selection.events.length,
  };
}

// --- rungs -----------------------------------------------------------------

const RUNGS = [
  { name: "full", drops: [] },
  { name: "no-sources", drops: ["the source and link for each event"] },
  { name: "compact", drops: ["the source, link and certainty for each event"] },
  {
    name: "summary",
    drops: [
      "the source, link and certainty for each event",
      `all but the ${SUMMARY_KEEP} longest-running events in each region`,
    ],
  },
];

function render(selection, preset, question, rung) {
  const groups = groupByRegion(selection);
  const { lines, includedCount } = renderGroups(groups, rung);

  const parts = [
    preset.instruction,
    "",
    grounding(),
    "",
    header(selection, rung, includedCount),
    "",
    lines.join("\n"),
  ];

  if (question.trim()) {
    parts.push("", "---", "", question.trim());
  }

  return {
    text: parts.join("\n").trimEnd() + "\n",
    rung,
    dropped: RUNGS[rung].drops,
    includedCount,
  };
}

function renderGroups(groups, rung) {
  const lines = [];
  let includedCount = 0;

  for (const group of groups) {
    // A region is never dropped. Losing a lane would misrepresent the
    // selection rather than shorten it.
    const kept = rung >= 3 ? summarise(group.events) : group.events;
    const omitted = group.events.length - kept.length;

    lines.push(
      `## ${group.label}${omitted > 0 ? ` — showing ${kept.length} of ${group.events.length}` : ""}`,
    );

    for (const event of ordered(kept)) {
      lines.push(renderEvent(event, rung));
      includedCount++;
    }
    lines.push("");
  }

  return { lines, includedCount };
}

function ordered(events) {
  return [...events].sort((a, b) => a.start - b.start);
}

/**
 * Choose which events in a region survive the last rung.
 *
 * Longest-running first, because a long interval is the context that short
 * events sit inside. But every domain present in the region keeps at least one
 * representative, even when that pushes the count past the target: a summary
 * that silently loses the region's only economic event would misreport the
 * shape of the selection, which is exactly what this ladder exists to avoid.
 */
function summarise(events) {
  const ranked = longestFirst(events);
  const present = new Set(events.map((event) => event.category));

  const chosen = ranked.slice(0, SUMMARY_KEEP);
  const covered = new Set(chosen.map((event) => event.category));
  const missing = [...present].filter((category) => !covered.has(category));
  if (missing.length === 0) return chosen;

  // Make room by dropping from the tail, then add one representative each.
  const trimmed = chosen.slice(0, Math.max(1, SUMMARY_KEEP - missing.length));
  const result = [...trimmed];
  for (const category of missing) {
    const representative = ranked.find((event) => event.category === category);
    if (representative && !result.some((event) => event.id === representative.id)) {
      result.push(representative);
    }
  }
  return result;
}

/**
 * Longest-running first. A long interval is the context a short event sits
 * inside, so when only a few can survive these are the ones worth keeping.
 */
function longestFirst(events) {
  return [...events].sort((a, b) => {
    const spanA = eventEnd(a) - a.start;
    const spanB = eventEnd(b) - b.start;
    if (spanA !== spanB) return spanB - spanA;
    return a.start - b.start;
  });
}

function renderEvent(event, rung) {
  const dates = formatEventRange(event);

  // The domain tag is present at every rung, in the same machine-readable
  // form. It is how a reader — or a test — can tell that no domain was quietly
  // lost when the listing was shortened.
  if (rung >= 2) return `- ${event.label} (${dates}) [${event.category}]`;

  const bits = [`- ${event.label}`, dates, `[${event.category}] ${CATEGORY_LABELS[event.category]}`];
  if (isUncertain(event)) {
    bits.push(event.uncertainty > 0 ? `date uncertain ±${event.uncertainty}y` : "date approximate");
  }
  if (rung < 1) {
    if (event.source) bits.push(`source: ${event.source}`);
    if (event.link) bits.push(event.link);
  }
  return bits.join(" · ");
}

// --- framing ---------------------------------------------------------------

function grounding() {
  return `### How to read this selection

Events come from a timeline that places six domains on one year axis, in one lane per world region. Lanes are aligned on time, which means events that appear together were contemporaneous — it does not on its own mean they were connected. Treat alignment as a prompt to investigate, not as evidence.

Regions are a fixed set, coarser than countries: ${Object.entries(REGION_LABELS)
    .map(([key, label]) => `${label} (${key})`)
    .join(", ")}. Global is a real lane for events with no single home — pandemics, climate periods, world markets — not a missing value. South Asia includes Southeast Asia and Indonesia; East Asia includes Japan and Siberia.

Domains: ${Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => `${label} (${key})`)
    .join(", ")}.

Dates carry their own precision. An event shown as "c. 1610 BC" is contested and the stated uncertainty is in years — do not build an argument on a tight coincidence between two uncertain dates. An event with a single date is an instant; one with two spans that whole range.`;
}

function header(selection, rung, includedCount) {
  const lines = [
    "### The selection",
    "",
    `Time range: ${formatYear(selection.from)} to ${formatYear(selection.to)}`,
  ];

  if (isUnfiltered(selection)) {
    lines.push("Filters: none — every domain and region is shown");
  } else {
    lines.push(
      `Domains shown: ${selection.categories.map((c) => CATEGORY_LABELS[c]).join(", ")}`,
      `Regions shown: ${selection.regions.map((r) => REGION_LABELS[r]).join(", ")}`,
    );
    lines.push(
      "Anything outside those filters is hidden from this selection but may still be relevant.",
    );
  }

  const byCategory = countByCategory(selection);
  lines.push(
    `Events in range: ${selection.events.length}` +
      (byCategory.length ? ` (${byCategory.map((c) => `${c.count} ${c.label.toLowerCase()}`).join(", ")})` : ""),
  );

  // The disclosure. This is the whole point of the ladder. The event-count
  // sentence appears only when events were actually cut — the earlier rungs
  // thin each entry but keep every one of them, and saying "634 of 634 events
  // are listed" reads as a warning about nothing.
  if (RUNGS[rung].drops.length) {
    const trimmed = includedCount < selection.events.length;
    lines.push(
      "",
      `This selection was too large to include in full, so it has been shortened: ${RUNGS[rung].drops.join("; ")} ${RUNGS[rung].drops.length === 1 ? "has" : "have"} been left out.` +
        (trimmed ? ` ${includedCount} of ${selection.events.length} events are listed below.` : " Every event in range is still listed."),
    );
  }

  return lines.join("\n");
}

/**
 * A rough token count. The exact answer needs the token-counting endpoint,
 * which this feature deliberately makes no network calls to reach, so this is
 * an estimate and the UI must present it as one.
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
