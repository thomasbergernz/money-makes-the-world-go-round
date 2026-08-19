import { describe, it, expect } from "vitest";
import { buildPrompt, PURPOSES, RUNG_COUNT, estimateTokens } from "../src/selection/digest.js";
import { buildSelection } from "../src/selection/selection.js";
import { normaliseRow, REGIONS, CATEGORIES } from "../src/data/schema.js";

const allOn = {
  categories: new Set(CATEGORIES),
  regions: new Set(REGIONS),
};

function event(overrides) {
  return normaliseRow({
    id: "e",
    start: "1815",
    end: "1817",
    label: "An event",
    category: "nature",
    region: "EUROPE",
    certainty: "year",
    uncertainty: "",
    source: "A source",
    link: "",
    ...overrides,
  });
}

function selectionOf(events, filters = allOn) {
  return buildSelection({ from: 1700, to: 1900, events }, filters);
}

/** A selection big enough to force the ladder down. */
function bigSelection(perRegion = 40) {
  const events = [];
  for (const region of REGIONS) {
    for (let i = 0; i < perRegion; i++) {
      events.push(
        event({
          id: `${region.toLowerCase().replace("_", "-")}-${i}`,
          region,
          start: String(1700 + i),
          end: String(1700 + i + (i % 7)),
          label: `Event ${i} in ${region} with a reasonably long descriptive label`,
          source: "A fairly verbose source citation with several words in it",
          link: "https://example.com/a/moderately/long/link/path",
        }),
      );
    }
  }
  return selectionOf(events);
}

describe("buildPrompt", () => {
  it("includes the grounding preamble in every purpose", () => {
    for (const purpose of Object.keys(PURPOSES)) {
      const { text } = buildPrompt(selectionOf([event({ id: "a" })]), { purpose });
      expect(text, purpose).toContain("How to read this selection");
      expect(text, purpose).toContain("does not on its own mean they were connected");
    }
  });

  it("explains the region and domain vocabularies", () => {
    const { text } = buildPrompt(selectionOf([event({ id: "a" })]));
    expect(text).toContain("GLOBAL");
    expect(text).toContain("not a missing value");
    expect(text).toContain("South Asia includes Southeast Asia");
  });

  it("warns that uncertain dates are uncertain", () => {
    const { text } = buildPrompt(selectionOf([event({ id: "a" })]));
    expect(text).toContain("c. 1610 BC");
    expect(text).toContain("uncertainty is in years");
  });

  it("carries the question through when one is given", () => {
    const { text } = buildPrompt(selectionOf([event({ id: "a" })]), {
      purpose: "question",
      question: "why did the harvest fail?",
    });
    expect(text).toContain("why did the harvest fail?");
  });

  it("gives the gaps preset our CSV schema to answer in", () => {
    const { text } = buildPrompt(selectionOf([event({ id: "a" })]), { purpose: "gaps" });
    expect(text).toContain("id,start,end,label,category,region,certainty,uncertainty,source,link");
  });

  it("states the range and the filters", () => {
    const { text } = buildPrompt(selectionOf([event({ id: "a" })]));
    expect(text).toContain("1700 to 1900");
    expect(text).toContain("every domain and region is shown");
  });

  it("says which filters are active and that they hide things", () => {
    const { text } = buildPrompt(
      selectionOf([event({ id: "a" })], {
        categories: new Set(["nature"]),
        regions: new Set(["EUROPE", "GLOBAL"]),
      }),
    );
    expect(text).toContain("Nature & climate");
    expect(text).not.toContain("Domains shown: Nature & climate, Economy");
    expect(text).toContain("hidden from this selection");
  });
});

describe("the cap ladder", () => {
  it("uses the full rung when the selection fits", () => {
    const result = buildPrompt(selectionOf([event({ id: "a" })]));
    expect(result.rung).toBe(0);
    expect(result.dropped).toEqual([]);
    expect(result.text).toContain("source: A source");
  });

  it("each rung is smaller than the one above it", () => {
    const selection = bigSelection();
    const lengths = [];
    for (let rung = 0; rung < RUNG_COUNT; rung++) {
      lengths.push(buildPrompt(selection, { rung }).text.length);
    }
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i], `rung ${i} vs rung ${i - 1}`).toBeLessThan(lengths[i - 1]);
    }
  });

  it("picks the least lossy rung that fits the budget", () => {
    const selection = bigSelection();
    const full = buildPrompt(selection, { rung: 0 }).text.length;
    expect(buildPrompt(selection, { maxChars: full }).rung).toBe(0);
    expect(buildPrompt(selection, { maxChars: full - 1 }).rung).toBeGreaterThan(0);
  });

  it("discloses in the prompt itself whatever it dropped", () => {
    for (let rung = 1; rung < RUNG_COUNT; rung++) {
      const result = buildPrompt(bigSelection(), { rung });
      expect(result.text, `rung ${rung}`).toContain("too large to include in full");
      for (const drop of result.dropped) {
        expect(result.text, `rung ${rung} should disclose "${drop}"`).toContain(drop);
      }
      if (result.includedCount < result.eventCount) {
        expect(result.text).toMatch(/\d+ of \d+ events are listed below/);
      } else {
        // Thinning each entry is not the same as dropping events, and the
        // disclosure must not imply otherwise.
        expect(result.text).toContain("Every event in range is still listed");
        expect(result.text).not.toMatch(/(\d+) of \1 events are listed below/);
      }
    }
  });

  it("never drops a region that has events", () => {
    const selection = bigSelection();
    for (let rung = 0; rung < RUNG_COUNT; rung++) {
      const { text } = buildPrompt(selection, { rung });
      const headings = [...text.matchAll(/^## (.+?)(?: —|$)/gm)].map((m) => m[1]);
      expect(headings.length, `rung ${rung}`).toBe(REGIONS.length);
    }
  });

  it("never drops a domain that has events, even at the most lossy rung", () => {
    // Every category gets one deliberately short event in a region otherwise
    // full of long ones, so longest-first ranking would discard each domain's
    // only representative without explicit protection.
    const short = CATEGORIES.map((category, i) =>
      event({
        id: `short-${i}`,
        category,
        region: "AFRICA",
        start: "1750",
        end: "1750",
        label: `A short ${category} event`,
      }),
    );
    const mixed = selectionOf([...short, ...bigSelection().events]);

    for (let rung = 0; rung < RUNG_COUNT; rung++) {
      const { text } = buildPrompt(mixed, { rung });
      const listing = text.slice(text.search(/^## /m));
      for (const category of CATEGORIES) {
        expect(listing, `${category} at rung ${rung}`).toContain(`[${category}]`);
      }
    }
  });

  it("says how many of a region's events survived when it trims", () => {
    const { text } = buildPrompt(bigSelection(), { rung: RUNG_COUNT - 1 });
    expect(text).toMatch(/## .+ — showing \d+ of \d+/);
  });

  it("reports the true total even when it lists fewer", () => {
    const selection = bigSelection();
    const result = buildPrompt(selection, { rung: RUNG_COUNT - 1 });
    expect(result.eventCount).toBe(selection.events.length);
    expect(result.includedCount).toBeLessThan(result.eventCount);
    expect(result.text).toContain(`Events in range: ${selection.events.length}`);
  });
});

describe("edge cases", () => {
  it("handles a single event", () => {
    const result = buildPrompt(selectionOf([event({ id: "only" })]));
    expect(result.eventCount).toBe(1);
    expect(result.text).toContain("An event");
  });

  it("handles an empty selection without producing a broken prompt", () => {
    const result = buildPrompt(selectionOf([]));
    expect(result.eventCount).toBe(0);
    expect(result.text).toContain("Events in range: 0");
    expect(result.text).toContain("How to read this selection");
    expect(result.text.length).toBeGreaterThan(200);
  });

  it("handles an instant, which has one date and no end", () => {
    const { text } = buildPrompt(selectionOf([event({ id: "i", end: "", label: "A moment" })]));
    expect(text).toContain("A moment");
    expect(text).not.toContain("A moment · 1815 – 1815");
  });

  it("marks a contested date as uncertain in the listing", () => {
    const { text } = buildPrompt(
      selectionOf([
        event({ id: "t", start: "1628 BC", end: "", certainty: "contested", uncertainty: "50", label: "Thera" }),
      ]),
    );
    expect(text).toContain("c. 1628 BC");
    expect(text).toContain("±50y");
  });
});

describe("estimateTokens", () => {
  it("scales with length", () => {
    expect(estimateTokens("x".repeat(4000))).toBe(1000);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("dataUrl", () => {
  it("stamps every dataset request so a deploy invalidates cached CSVs", async () => {
    const { dataUrl } = await import("../src/data/load.js");
    const url = dataUrl("data/nature.csv");
    expect(url).toMatch(/^data\/nature\.csv\?v=.+$/);
  });

  it("gives every dataset the same stamp, so one deploy busts them together", async () => {
    const { dataUrl } = await import("../src/data/load.js");
    const stamp = (file) => dataUrl(file).split("?v=")[1];
    expect(stamp("data/nature.csv")).toBe(stamp("data/economy.csv"));
  });
});
